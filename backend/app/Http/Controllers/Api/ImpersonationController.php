<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\Impersonation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** The superadmin, signed in as an account owner, goes back to their own account. */
class ImpersonationController extends Controller
{
    public function __construct(private readonly Impersonation $impersonation) {}

    public function stop(Request $request): UserResource|JsonResponse
    {
        if (! $this->impersonation->isActive($request)) {
            throw ValidationException::withMessages(['account' => 'You’re already in your own account.']);
        }

        $admin = $this->impersonation->stop($request);

        return $admin
            ? new UserResource($admin)
            : response()->json(['message' => 'Your admin access has changed. Please log in again.'], 401);
    }
}
