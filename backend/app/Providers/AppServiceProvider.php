<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Catch lazy-loading (N+1) and mass-assignment mistakes early outside production.
        Model::shouldBeStrict(! $this->app->isProduction());

        // Account owners manage the team, the plan and stream keys; sub-users can't.
        Gate::define('manage-account', fn (User $user): bool => ! $user->isSubUser());
        // The superadmin approves plan requests and edits plans.
        Gate::define('admin', fn (User $user): bool => $user->isSuperAdmin());

        // Password reset emails link to the SPA, not to this API.
        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            return rtrim((string) config('livesell.frontend_url'), '/')
                .'/reset-password?token='.urlencode($token)
                .'&email='.urlencode($notifiable->getEmailForPasswordReset());
        });

        $this->configureRateLimiting();
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));

        // Failed log-ins: 5 a minute per email + IP, and 30 a minute per IP overall.
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip())->response(fn () => response()->json([
                    'message' => 'Too many tries. Wait a minute, then try again.',
                ], 429)),
                Limit::perMinute(30)->by('login-ip|'.$request->ip()),
            ];
        });

        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));
        RateLimiter::for('password-reset', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(30)->by($request->user()?->id ?: $request->ip()));

        // Popup taps and slider moves while live (the editor already debounces these).
        RateLimiter::for('live', fn (Request $request) => Limit::perMinute(600)->by($request->user()?->id ?: $request->ip()));

        // Clean screens poll every second as a fallback when the WebSocket drops; several
        // screens can share one IP (a shop's Wi-Fi), so allow a few at once.
        RateLimiter::for('output', fn (Request $request) => Limit::perMinute(300)->by($request->ip()));

        // The local relay claiming streaming tickets (one per "Go live").
        RateLimiter::for('relay', fn (Request $request) => Limit::perMinute(30)->by($request->ip()));

        // Payment submissions (a receipt upload each): a few an hour per account is plenty.
        RateLimiter::for('payments', fn (Request $request) => Limit::perHour(10)->by($request->user()?->id ?: $request->ip()));
    }
}
