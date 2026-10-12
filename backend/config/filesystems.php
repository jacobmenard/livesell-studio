<?php

// Only the settings this app changes; the other disks keep Laravel's defaults.
return [

    'disks' => [

        /*
        | Local uploads. URLs are root-relative ("/storage/...") because the SPA always
        | reaches the API on its own origin (the Vite proxy forwards /storage in development),
        | so uploads load on localhost, a LAN IP and https alike. Set PUBLIC_STORAGE_URL to
        | an absolute URL only if the SPA is served from a different domain than the API.
        */
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('PUBLIC_STORAGE_URL', '/storage'),
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

    ],

];
