<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OutputLink;
use App\Models\Setup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

/**
 * The private clean-screen link sellers paste into OBS or TikTok LIVE Studio.
 * The token is shown once when the link is made; only its hash is stored.
 */
class OutputLinkController extends Controller
{
    public function show(Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);
        $link = $setup->outputLinks()->active()->latest('id')->first();

        return response()->json([
            'data' => [
                'active' => $link !== null,
                'created_at' => $link?->created_at?->toIso8601String(),
                'last_seen_at' => $link?->last_seen_at?->toIso8601String(),
            ],
        ]);
    }

    /** Makes a new link and turns every older one off. */
    public function store(Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);
        $token = OutputLink::generateToken();

        $link = DB::transaction(function () use ($setup, $token): OutputLink {
            $setup->outputLinks()->active()->update(['revoked_at' => now()]);

            return $setup->outputLinks()->create([
                'public_id' => Str::lower((string) Str::ulid()),
                'token_hash' => OutputLink::hashToken($token),
            ]);
        });

        return response()->json([
            'data' => [
                'active' => true,
                'token' => $token,
                'url' => rtrim((string) config('livesell.frontend_url'), '/').'/output/'.$token,
                'created_at' => $link->created_at?->toIso8601String(),
                'last_seen_at' => null,
            ],
        ], 201);
    }

    public function destroy(Setup $setup): Response
    {
        Gate::authorize('goLive', $setup);
        $setup->outputLinks()->active()->update(['revoked_at' => now()]);

        return response()->noContent();
    }
}
