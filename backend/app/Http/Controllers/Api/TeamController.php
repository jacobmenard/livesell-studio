<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Subscriptions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * The owner's team: sub-users who sign in with their own email and password and work in the
 * owner's account (setups, uploads, going live), within the plan's seats.
 */
class TeamController extends Controller
{
    public function __construct(private readonly Subscriptions $subscriptions) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->team($request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $owner = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', 'not_regex:/[\x00-\x1F\x7F]/u'],
            'email' => ['required', 'string', 'email:rfc', 'max:254', 'unique:users,email'],
            'password' => ['required', 'string', 'max:128', PasswordRule::min(8)],
        ]);

        $plan = $this->subscriptions->planFor($owner);
        $used = $owner->subUsers()->whereNull('deactivated_at')->count();
        if ($used >= $plan->max_subusers) {
            throw ValidationException::withMessages(['email' => $plan->max_subusers === 0
                ? "Your {$plan->name} plan doesn't include sub-users. Upgrade to add your team."
                : "Your {$plan->name} plan has room for {$plan->max_subusers} sub-user".($plan->max_subusers === 1 ? '' : 's').'. Upgrade to add more.']);
        }

        $member = new User([
            'name' => trim($data['name']),
            'email' => Str::lower($data['email']),
            'password' => $data['password'],
        ]);
        $member->forceFill(['owner_id' => $owner->id]);
        $member->save();

        return response()->json(['data' => $this->team($owner)], 201);
    }

    public function destroy(Request $request, User $member): Response
    {
        $owner = $request->user();
        abort_unless($member->owner_id === $owner->id, 404);

        $member->delete();
        // A freed seat brings back a member who was paused by a smaller plan.
        $this->subscriptions->fitSeats($owner, $this->subscriptions->planFor($owner));

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function team(User $owner): array
    {
        $plan = $this->subscriptions->planFor($owner);

        return [
            'seats' => $plan->max_subusers,
            'plan_name' => $plan->name,
            'members' => $owner->subUsers()->orderBy('created_at')->orderBy('id')->get()->map(fn (User $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'email' => $m->email,
                'active' => ! $m->isDeactivated(),
                'added_at' => $m->created_at?->toIso8601String(),
            ])->values(),
        ];
    }
}
