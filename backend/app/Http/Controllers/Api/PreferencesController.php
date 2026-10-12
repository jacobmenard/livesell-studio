<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Support\Catalog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PreferencesController extends Controller
{
    /** Saves the Light / Dark / Auto choice to the account so it follows the seller. */
    public function update(Request $request): UserResource
    {
        $data = $request->validate([
            'theme' => ['required', Rule::in(Catalog::THEMES)],
        ]);

        $user = $request->user();
        $user->forceFill(['theme' => $data['theme']])->save();

        return new UserResource($user);
    }

    /** A walkthrough was finished or skipped (the route only accepts known tours). */
    public function completeTour(Request $request, string $tour): UserResource
    {
        $user = $request->user();
        $user->completeTour($tour);

        return new UserResource($user);
    }
}
