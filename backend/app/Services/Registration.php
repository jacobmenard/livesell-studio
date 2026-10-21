<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

/**
 * Creating a seller account, shared by the website (cookie session) and the Android app
 * (token), so both sign-ups get the same rules and the same free week.
 */
final class Registration
{
    /** @return array<string, array<int, mixed>> */
    public static function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80', 'not_regex:/[\x00-\x1F\x7F]/u'],
            'email' => ['required', 'string', 'email:rfc', 'max:254', 'unique:users,email'],
            'password' => ['required', 'string', 'max:128', 'confirmed', PasswordRule::min(8)],
        ];
    }

    /** @param array{name: string, email: string, password: string} $data */
    public function register(array $data): User
    {
        $trialDays = (int) config('livesell.trial_days');

        $user = new User([
            'name' => trim($data['name']),
            'email' => Str::lower($data['email']),
            'password' => $data['password'],
        ]);
        $user->forceFill(['trial_ends_at' => $trialDays > 0 ? now()->addDays($trialDays) : null])->save();

        event(new Registered($user));

        return $user;
    }
}
