<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateSetupRequest;
use App\Http\Resources\SetupResource;
use App\Models\Setup;
use App\Services\SceneResolver;
use App\Services\SetupWriter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class SetupController extends Controller
{
    public function __construct(
        private readonly SetupWriter $writer,
        private readonly SceneResolver $resolver,
    ) {}

    /** The seller's setups plus the starter templates, for the dashboard. */
    public function index(Request $request): JsonResponse
    {
        $setups = Setup::query()
            ->visibleTo($request->user())
            ->withCount(['popups as linked_sounds_count' => fn (Builder $q) => $q->whereNotNull('sound')])
            ->orderByDesc('updated_at')
            ->limit(500)
            ->get();

        $scenes = $this->resolver->resolveMany($setups);

        return response()->json([
            'data' => $setups->map(fn (Setup $s) => (new SetupResource($s, $scenes[$s->id]))->resolve($request))->values(),
        ]);
    }

    /**
     * Starts a new setup: blank, or a copy of a template / one of the seller's setups.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', 'not_regex:/[\x00-\x1F\x7F]/u'],
            'from_setup_id' => ['sometimes', 'integer', 'min:1'],
        ]);
        // Setups belong to the account, so a sub-user's new setup is the owner's.
        $user = $request->user()->accountOwner();

        $limit = (int) config('livesell.max_setups_per_user');
        if ($user->setups()->count() >= $limit) {
            throw ValidationException::withMessages(['name' => "You can keep up to {$limit} setups. Delete one to make room."]);
        }

        if (isset($data['from_setup_id'])) {
            $source = Setup::query()->findOrFail($data['from_setup_id']);
            Gate::authorize('duplicate', $source);
            $setup = $this->writer->duplicate($source, $user, $data['name'] ?? null);
        } else {
            $setup = $this->writer->createBlank($user, trim($data['name'] ?? '') ?: 'New setup');
        }

        return $this->full($setup, $request, 201);
    }

    public function show(Request $request, Setup $setup): JsonResponse
    {
        Gate::authorize('view', $setup);

        return $this->full($setup, $request);
    }

    public function update(UpdateSetupRequest $request, Setup $setup): JsonResponse
    {
        $this->writer->save($setup, $request->validated());

        return $this->full($setup, $request);
    }

    public function duplicate(Request $request, Setup $setup): JsonResponse
    {
        Gate::authorize('duplicate', $setup);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', 'not_regex:/[\x00-\x1F\x7F]/u'],
        ]);
        // Setups belong to the account, so a sub-user's new setup is the owner's.
        $user = $request->user()->accountOwner();

        $limit = (int) config('livesell.max_setups_per_user');
        if ($user->setups()->count() >= $limit) {
            throw ValidationException::withMessages(['name' => "You can keep up to {$limit} setups. Delete one to make room."]);
        }

        $name = $data['name'] ?? mb_substr($setup->name.' (copy)', 0, 60);
        $copy = $this->writer->duplicate($setup, $user, $name);

        return $this->full($copy, $request, 201);
    }

    public function destroy(Setup $setup): Response
    {
        Gate::authorize('delete', $setup);
        $setup->delete();

        return response()->noContent();
    }

    private function full(Setup $setup, Request $request, int $status = 200): JsonResponse
    {
        $setup->load('popups.media')
            ->loadCount(['popups as linked_sounds_count' => fn (Builder $q) => $q->whereNotNull('sound')]);

        $resource = new SetupResource($setup, $this->resolver->resolve($setup), full: true);

        return response()->json(['data' => $resource->resolve($request)], $status);
    }
}
