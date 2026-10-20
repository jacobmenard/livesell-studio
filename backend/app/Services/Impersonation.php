<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * The superadmin signs in as an account owner (to see what they see and help), then goes
 * back. Who is really behind it stays in the session, every start and stop is logged, and
 * only seller account owners can be impersonated.
 */
final class Impersonation
{
    private const ADMIN_ID = 'impersonator_id';

    private const ADMIN_NAME = 'impersonator_name';

    public function start(Request $request, User $admin, User $owner): void
    {
        if ($this->isActive($request)) {
            throw ValidationException::withMessages(['account' => 'Go back to your own account first.']);
        }
        if ($owner->isSubUser() || $owner->role !== UserRole::Seller || $owner->is($admin)) {
            throw ValidationException::withMessages(['account' => 'Only a seller’s own account can be opened this way.']);
        }

        // Not "remember me": impersonation ends with this browser session at the latest.
        Auth::guard('web')->login($owner);
        $request->session()->regenerate();
        $request->session()->put([self::ADMIN_ID => $admin->id, self::ADMIN_NAME => $admin->name]);

        Log::notice('[impersonation] started', $this->context($request, $admin, $owner));
    }

    /** Back to the superadmin who started it; null when that's no longer possible (signed out). */
    public function stop(Request $request): ?User
    {
        $owner = $request->user();
        $admin = User::query()->find($request->session()->get(self::ADMIN_ID));
        $request->session()->forget([self::ADMIN_ID, self::ADMIN_NAME]);

        if (! $admin || $admin->role !== UserRole::SuperAdmin) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return null;
        }

        Auth::guard('web')->login($admin);
        $request->session()->regenerate();
        Log::notice('[impersonation] stopped', $this->context($request, $admin, $owner));

        return $admin;
    }

    /** A real sign-in (login or sign-up) ends any impersonation in this browser for good. */
    public function forget(Request $request): void
    {
        if ($request->hasSession()) {
            $request->session()->forget([self::ADMIN_ID, self::ADMIN_NAME]);
        }
    }

    public function isActive(Request $request): bool
    {
        return $request->hasSession() && $request->session()->has(self::ADMIN_ID);
    }

    /** The superadmin's name while they're signed in as someone else, else null. */
    public function impersonatorName(Request $request): ?string
    {
        return $this->isActive($request) ? (string) $request->session()->get(self::ADMIN_NAME) : null;
    }

    /** @return array<string, mixed> */
    private function context(Request $request, User $admin, ?User $owner): array
    {
        return [
            'admin_id' => $admin->id,
            'admin_email' => $admin->email,
            'account_id' => $owner?->id,
            'account_email' => $owner?->email,
            'ip' => $request->ip(),
        ];
    }
}
