<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Registration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Token sign-in for the Android app (Sanctum personal access tokens). The website keeps
 * using the cookie session in AuthController. Every other /api route accepts either one
 * through auth:sanctum, so the app reuses the same setups, plan and live-session endpoints.
 *
 * The plain token is returned once; only its SHA-256 hash is stored. The app keeps it in
 * the phone's secure storage and sends it as "Authorization: Bearer <token>".
 */
class MobileAuthController extends Controller
{
    /** How long a phone stays signed in before asking for the password again. */
    public const TOKEN_DAYS = 90;

    /** Signed-in phones per seller; the oldest is signed out past this. */
    public const MAX_DEVICES = 5;

    public function __construct(private readonly Registration $registration) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128'],
            'device_name' => ['required', 'string', 'max:80', 'not_regex:/[\x00-\x1F\x7F]/u'],
        ]);

        /** @var User|null $user */
        $user = User::query()->where('email', Str::lower($data['email']))->first();

        // One message for both a wrong email and a wrong password, like the website.
        if ($user === null || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => "That email and password don't match. Try again, or reset your password.",
            ]);
        }

        if ($user->isDeactivated()) {
            throw ValidationException::withMessages(['email' => EnsureAccountIsActive::PAUSED_MESSAGE]);
        }

        return $this->issue($user, $data['device_name']);
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate(Registration::rules() + [
            'device_name' => ['required', 'string', 'max:80', 'not_regex:/[\x00-\x1F\x7F]/u'],
        ]);

        $user = $this->registration->register($data);

        return $this->issue($user, $data['device_name'], 201);
    }

    /** Signs this phone out: its token stops working at once. */
    public function logout(Request $request): Response
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        return response()->noContent();
    }

    /** The newest APK on the website, so the app can offer an update (see config livesell.android_app). */
    public function version(): JsonResponse
    {
        $app = config('livesell.android_app');
        $url = is_string($app['apk_url'] ?? null) && str_starts_with($app['apk_url'], 'https://') ? $app['apk_url'] : null;

        return response()->json([
            'data' => [
                'version_code' => (int) $app['version_code'],
                'version_name' => (string) $app['version_name'],
                'min_version_code' => (int) $app['min_version_code'],
                // Only an https link is ever handed out, so a typo can't send phones to a plain-http download.
                'apk_url' => $url,
                'size_mb' => $app['size_mb'],
                'notes' => $app['notes'],
            ],
        ]);
    }

    private function issue(User $user, string $deviceName, int $status = 200): JsonResponse
    {
        $token = $user->createToken(trim($deviceName), ['*'], now()->addDays(self::TOKEN_DAYS));

        // Keep the newest few phones; a lost phone drops off once the seller signs in elsewhere.
        $keep = $user->tokens()->latest('id')->limit(self::MAX_DEVICES)->pluck('id');
        $user->tokens()->whereNotIn('id', $keep)->delete();

        return response()->json([
            'data' => [
                'token' => $token->plainTextToken,
                'expires_at' => $token->accessToken->expires_at?->toIso8601String(),
                'user' => (new UserResource($user))->resolve(request()),
            ],
        ], $status);
    }
}
