<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signs out a user who may no longer come in: a sub-user paused by the plan's seats, or
 * anyone in an account the superadmin deactivated. They lose access right away instead of
 * when their session happens to expire.
 */
class EnsureAccountIsActive
{
    public const PAUSED_MESSAGE = 'Your access is paused because the account owner’s plan has no seat for you. Ask them to upgrade.';

    public const DISABLED_MESSAGE = 'This account has been deactivated. Contact NegosyoWork support if you think this is a mistake.';

    /** Why this user can't sign in or carry on (every sign-in checks it too), or null. */
    public static function refusal(User $user): ?string
    {
        if ($user->accountOwner()->isDisabled()) {
            return self::DISABLED_MESSAGE;
        }

        return $user->isDeactivated() ? self::PAUSED_MESSAGE : null;
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $refusal = $user instanceof User ? self::refusal($user) : null;
        if ($refusal !== null) {
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                // The Android app: every phone of this user is signed out, not only this one.
                $user->tokens()->delete();
            }
            if ($request->hasSession()) {
                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => $refusal], 403);
        }

        return $next($request);
    }
}
