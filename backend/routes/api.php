<?php

use App\Http\Controllers\Api\Admin\AccountController as AdminAccountController;
use App\Http\Controllers\Api\Admin\PaymentController as AdminPaymentController;
use App\Http\Controllers\Api\Admin\PlanController as AdminPlanController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BroadcastController;
use App\Http\Controllers\Api\DestinationController;
use App\Http\Controllers\Api\LiveSessionController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\OutputController;
use App\Http\Controllers\Api\OutputLinkController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PreferencesController;
use App\Http\Controllers\Api\SceneController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Facades\Route;

/*
| All routes here are prefixed with /api. The SPA authenticates with Sanctum's
| cookie session (GET /sanctum/csrf-cookie first, then send X-XSRF-TOKEN).
| "account.active" signs out sub-users paused by a smaller plan.
*/

Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:password-reset');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:password-reset');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me'])->middleware('account.active');
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

Route::middleware(['auth:sanctum', 'account.active', 'throttle:api'])->group(function () {
    Route::patch('me/preferences', [PreferencesController::class, 'update']);
    Route::put('me/tours/{tour}', [PreferencesController::class, 'completeTour'])->whereIn('tour', User::TOURS);

    Route::get('setups', [SetupController::class, 'index']);
    Route::post('setups', [SetupController::class, 'store']);
    Route::get('setups/{setup}', [SetupController::class, 'show']);
    Route::put('setups/{setup}', [SetupController::class, 'update']);
    Route::delete('setups/{setup}', [SetupController::class, 'destroy']);
    Route::post('setups/{setup}/duplicate', [SetupController::class, 'duplicate']);

    Route::get('setups/{setup}/output-link', [OutputLinkController::class, 'show']);
    Route::post('setups/{setup}/output-link', [OutputLinkController::class, 'store']);
    Route::delete('setups/{setup}/output-link', [OutputLinkController::class, 'destroy']);

    Route::get('media', [MediaController::class, 'index']);
    Route::post('media', [MediaController::class, 'store'])->middleware('throttle:uploads');
    Route::delete('media/{media}', [MediaController::class, 'destroy']);

    // Sub-users see the saved destinations (never the keys) and can stream with them,
    // but only the account owner changes them.
    Route::get('destinations', [DestinationController::class, 'index']);
    Route::put('destinations/{platform}', [DestinationController::class, 'update'])->middleware('can:manage-account');
    Route::delete('destinations/{platform}', [DestinationController::class, 'destroy'])->middleware('can:manage-account');

    Route::post('setups/{setup}/broadcasts', [BroadcastController::class, 'store']);

    // The account's plan, and paying for one (GCash to the bank account; the owner only).
    Route::get('subscription', [SubscriptionController::class, 'show']);
    Route::post('payments', [PaymentController::class, 'store'])->middleware(['can:manage-account', 'throttle:payments']);
    Route::get('payments/{payment}/proof', [PaymentController::class, 'proof']);

    // The owner's team of sub-users.
    Route::middleware('can:manage-account')->group(function () {
        Route::get('team', [TeamController::class, 'index']);
        Route::post('team', [TeamController::class, 'store']);
        Route::delete('team/{member}', [TeamController::class, 'destroy']);
    });

    // Superadmin: check payments, change plans, edit plan prices and limits.
    Route::middleware('can:admin')->prefix('admin')->group(function () {
        Route::get('payments', [AdminPaymentController::class, 'index']);
        Route::get('payments/pending-count', [AdminPaymentController::class, 'pendingCount']);
        Route::post('payments/{payment}/approve', [AdminPaymentController::class, 'approve']);
        Route::post('payments/{payment}/reject', [AdminPaymentController::class, 'reject']);
        Route::get('accounts', [AdminAccountController::class, 'index']);
        Route::put('accounts/{account}/plan', [AdminAccountController::class, 'updatePlan']);
        Route::get('plans', [AdminPlanController::class, 'index']);
        Route::put('plans/{plan}', [AdminPlanController::class, 'update']);
    });
});

// Live controls are hit often (every popup tap, every slider move), so they get their own limit.
Route::middleware(['auth:sanctum', 'account.active', 'throttle:live'])->group(function () {
    Route::get('setups/{setup}/scene', [SceneController::class, 'show']);
    Route::put('setups/{setup}/scene', [SceneController::class, 'update']);
    Route::post('setups/{setup}/sounds', [SceneController::class, 'sound']);

    // The seller's own clean-screen window: open, still open, closed (plan live limit).
    Route::post('setups/{setup}/live-sessions', [LiveSessionController::class, 'store']);
    Route::put('live-sessions/{session}', [LiveSessionController::class, 'update']);
    Route::delete('live-sessions/{session}', [LiveSessionController::class, 'destroy']);
});

// The plans and prices, for the public pricing page (no login).
Route::get('plans', fn () => PlanResource::collection(Plan::query()->ordered()->get()))->middleware('throttle:60,1');

// The local relay (relay/) swaps a one-time ticket for the stream server and key.
// Authenticated with RELAY_SECRET, not a user session.
Route::post('relay/claim', [BroadcastController::class, 'claim'])->middleware('throttle:relay');

// The clean screen behind a private link (OBS / TikTok LIVE Studio Browser Source).
Route::middleware('throttle:output')
    ->prefix('output/{token}')
    ->where(['token' => '[A-Za-z0-9]{48}'])
    ->group(function () {
        Route::get('/', [OutputController::class, 'show']);
        Route::post('auth', [OutputController::class, 'authorizeChannel']);
        Route::post('live-sessions', [LiveSessionController::class, 'storeForLink']);
        Route::put('live-sessions/{session}', [LiveSessionController::class, 'updateForLink']);
        Route::delete('live-sessions/{session}', [LiveSessionController::class, 'destroyForLink']);
    });
