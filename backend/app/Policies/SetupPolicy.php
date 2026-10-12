<?php

namespace App\Policies;

use App\Models\Setup;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Sellers can open their own setups and the shared templates, and change only their own.
 * Someone else's setup answers 404, so ids can't be probed.
 */
class SetupPolicy
{
    public function view(User $user, Setup $setup): Response
    {
        return $setup->is_template || $setup->isOwnedBy($user)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function update(User $user, Setup $setup): Response
    {
        return $setup->isOwnedBy($user) ? Response::allow() : Response::denyAsNotFound();
    }

    public function delete(User $user, Setup $setup): Response
    {
        return $this->update($user, $setup);
    }

    /** Copying works for templates and the seller's own setups. */
    public function duplicate(User $user, Setup $setup): Response
    {
        return $this->view($user, $setup);
    }

    /** Showing popups, playing sounds and managing the clean-screen link. */
    public function goLive(User $user, Setup $setup): Response
    {
        return $this->update($user, $setup);
    }
}
