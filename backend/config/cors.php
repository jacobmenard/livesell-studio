<?php

/*
| Only needed when the SPA is served from a different origin than the API. With the
| recommended setup (same domain, /api proxied) browsers never make CORS requests.
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([env('FRONTEND_URL', 'http://localhost:5173')]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Cookie sessions need credentials.
    'supports_credentials' => true,

];
