<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A setting the superadmin edits in the app (no redeploy), stored as key → text.
 *
 * @property string $key
 * @property string|null $value
 */
class AppSetting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    /**
     * @param  array<int, string>  $keys
     * @return array<string, string>
     */
    public static function values(array $keys): array
    {
        $stored = self::query()->whereIn('key', $keys)->pluck('value', 'key');

        return collect($keys)->mapWithKeys(fn (string $k) => [$k => (string) ($stored[$k] ?? '')])->all();
    }

    /** @param array<string, string|null> $values */
    public static function put(array $values): void
    {
        foreach ($values as $key => $value) {
            self::query()->updateOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
