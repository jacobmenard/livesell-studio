<?php

use App\Models\Setup;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
| setup.{id}  — the seller's own clean-screen window (signed in).
| output.{id} — a private Browser Source link. Authorized only through
|               POST /api/output/{token}/auth, never with a session.
*/

Broadcast::channel('setup.{setup}', function (User $user, Setup $setup): bool {
    return $setup->isOwnedBy($user);
});

Broadcast::channel('output.{publicId}', fn (): bool => false);
