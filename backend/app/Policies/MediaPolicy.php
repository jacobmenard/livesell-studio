<?php

namespace App\Policies;

use App\Models\Media;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class MediaPolicy
{
    public function delete(User $user, Media $media): Response
    {
        return (int) $media->user_id === $user->accountId() ? Response::allow() : Response::denyAsNotFound();
    }
}
