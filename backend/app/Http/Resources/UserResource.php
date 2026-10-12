<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'theme' => $this->theme,
            // Walkthroughs already seen; the others start on first visit.
            'completed_tours' => array_values(array_intersect(User::TOURS, $this->completed_tours ?? [])),
            'role' => $this->role->value,
            // A team member works in the owner's account (setups, uploads, plan).
            'is_subuser' => $this->isSubUser(),
            'account_name' => $this->accountOwner()->name,
        ];
    }
}
