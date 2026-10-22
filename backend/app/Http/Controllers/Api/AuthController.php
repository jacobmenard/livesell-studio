<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Impersonation;
use App\Services\Registration;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * Cookie-session sign-in for the SPA (Laravel Sanctum, stateful). The SPA first calls
 * GET /sanctum/csrf-cookie, then these endpoints with the X-XSRF-TOKEN header.
 */
class AuthController extends Controller
{
    public function __construct(
        private readonly Impersonation $impersonation,
        private readonly Registration $registration,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate(Registration::rules());

        // Also starts the free week (not fillable, so sign-up input can never set it).
        $user = $this->registration->register($data);

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $this->impersonation->forget($request);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function login(Request $request): UserResource
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $ok = Auth::guard('web')->attempt(
            ['email' => Str::lower($credentials['email']), 'password' => $credentials['password']],
            $request->boolean('remember'),
        );

        if (! $ok) {
            // Same message whether the email exists or not, so accounts can't be discovered.
            throw ValidationException::withMessages([
                'email' => "That email and password don't match. Try again, or reset your password.",
            ]);
        }

        // The user this attempt just signed in (not whoever the request carried before).
        /** @var User $user */
        $user = Auth::guard('web')->user();

        // A paused sub-user (owner's plan has no seat for them) can't come in.
        if ($user->isDeactivated()) {
            Auth::guard('web')->logout();
            throw ValidationException::withMessages(['email' => EnsureAccountIsActive::PAUSED_MESSAGE]);
        }

        $request->session()->regenerate();
        $this->impersonation->forget($request);

        return new UserResource($user);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'string', 'email', 'max:254']]);

        $status = Password::sendResetLink(['email' => Str::lower($request->string('email')->toString())]);

        if ($status === Password::RESET_THROTTLED) {
            throw ValidationException::withMessages(['email' => 'Please wait a minute before asking for another link.']);
        }

        // Always the same answer, so the form can't be used to check who has an account.
        return response()->json([
            'message' => 'If that email has an account, a reset link is on its way.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string', 'max:200'],
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128', 'confirmed', PasswordRule::min(8)],
        ]);

        $status = Password::reset(
            [
                'email' => Str::lower($request->string('email')->toString()),
                'password' => $request->string('password')->toString(),
                'password_confirmation' => $request->string('password_confirmation')->toString(),
                'token' => $request->string('token')->toString(),
            ],
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();
                // A new password signs the account out of the Android app on every phone too.
                $user->tokens()->delete();

                event(new PasswordReset($user));
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => 'This reset link is invalid or has expired. Ask for a new one.']);
        }

        return response()->json(['message' => 'Your password has been changed. You can log in now.']);
    }
}
