<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Impersonation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Opens the website from the Android app already signed in (plans are paid there) without
 * putting the app's token in a link: the app asks for a code that works once, for a minute,
 * and the website swaps it for its own cookie session. Only the code's hash is stored.
 */
class WebHandoffController extends Controller
{
    private const PREFIX = 'web-handoff:';

    private const CODE_LENGTH = 48;

    public function __construct(private readonly Impersonation $impersonation) {}

    /** Called by the app (bearer token): a one-time link to a page of the website. */
    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            // A page of the website, never another site.
            'path' => ['required', 'string', 'max:100', 'regex:#^/[a-z][a-z0-9/-]*$#'],
        ]);

        $code = Str::random(self::CODE_LENGTH);
        Cache::put(self::PREFIX.hash('sha256', $code), $request->user()->id, now()->addSeconds((int) config('livesell.web_handoff_ttl')));

        // After the #: browsers never send it to a server, so it stays out of logs and Referer headers.
        $url = rtrim((string) config('livesell.frontend_url'), '/').'/handoff#'.http_build_query(['code' => $code, 'next' => $data['path']]);

        return response()->json(['data' => ['url' => $url]], 201);
    }

    /** Called by the website: swaps a code, once, for a signed-in session (like logging in). */
    public function claim(Request $request): UserResource
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:'.self::CODE_LENGTH]]);

        $userId = Cache::pull(self::PREFIX.hash('sha256', $data['code']));
        $user = $userId === null ? null : User::query()->find($userId);
        if ($user === null) {
            throw ValidationException::withMessages(['code' => 'This link has expired. Open it again from the app, or log in.']);
        }

        // A paused sub-user (owner's plan has no seat for them) or a deactivated account can't come in.
        if (($refusal = EnsureAccountIsActive::refusal($user)) !== null) {
            throw ValidationException::withMessages(['code' => $refusal]);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $this->impersonation->forget($request);

        return new UserResource($user);
    }
}
