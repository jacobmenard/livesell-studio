<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signs out a sub-user who was paused (the owner's plan has fewer seats than members),
 * so they lose access right away instead of when their session happens to expire.
 */
class EnsureAccountIsActive
{
    public const PAUSED_MESSAGE = 'Your access is paused because the account owner’s plan has no seat for you. Ask them to upgrade.';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user !== null && $user->isDeactivated()) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => self::PAUSED_MESSAGE], 403);
        }

        return $next($request);
    }
}
