<?php

use Laravel\Sanctum\Sanctum;

// Only the settings this app changes; everything else keeps Sanctum's defaults.
return [

    /*
    | Hosts whose requests get cookie-session (stateful) authentication.
    |
    | The SPA always calls the API on its own origin (the Vite proxy in development, the
    | same domain in production), so the host a request was sent to is first-party too.
    | That is what lets the dev server be opened by LAN IP (npm run dev -- --host).
    | CSRF protection still applies; add other front-end origins to SANCTUM_STATEFUL_DOMAINS.
    */
    'stateful' => explode(',', env(
        'SANCTUM_STATEFUL_DOMAINS',
        'localhost,localhost:5173,127.0.0.1,127.0.0.1:5173,::1',
    ).Sanctum::currentRequestHost()),

];
