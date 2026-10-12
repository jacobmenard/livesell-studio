<?php

return [

    /*
    | Where the React app lives. Used for clean-screen links and password-reset emails.
    */
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    /*
    | Disk for uploaded popup images, backgrounds and sounds. Use "public" locally;
    | in production point it at S3-style storage served from a separate domain.
    */
    'media_disk' => env('MEDIA_DISK', 'public'),

    'max_media_per_user' => (int) env('LIVESELL_MAX_MEDIA_PER_USER', 200),

    'max_setups_per_user' => (int) env('LIVESELL_MAX_SETUPS_PER_USER', 100),

    /*
    | The plan (by code) accounts have without a subscription, or after it ends: the free
    | trial, which sets everything up but can't go live.
    */
    'default_plan' => env('LIVESELL_DEFAULT_PLAN', 'trial'),

    /*
    | Streaming straight to Facebook / YouTube goes through the local relay (relay/),
    | which swaps a one-time ticket for the saved server and key. The relay must use the
    | same secret; leave it empty to turn direct streaming off.
    */
    'relay_secret' => env('RELAY_SECRET'),

    'broadcast_ticket_ttl' => (int) env('LIVESELL_BROADCAST_TICKET_TTL', 60),

    /*
    | The superadmin account made by SuperAdminSeeder. Leave the password empty locally
    | to have one generated and printed; production refuses to seed without one.
    */
    'superadmin' => [
        'name' => env('SUPERADMIN_NAME', 'Super Admin'),
        'email' => env('SUPERADMIN_EMAIL', 'superadmin@livesell.test'),
        'password' => env('SUPERADMIN_PASSWORD'),
    ],

];
