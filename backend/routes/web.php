<?php

use Illuminate\Support\Facades\Route;

// This app is an API for the NegosyoWork Studio SPA; the web UI is served by the frontend.
Route::get('/', fn () => response()->json([
    'name' => config('app.name'),
    'status' => 'ok',
]));
