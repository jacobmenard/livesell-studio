<?php

namespace App\Services;

use App\Models\Setup;
use App\Models\SetupPopup;
use App\Models\User;
use App\Support\Catalog;
use Illuminate\Support\Facades\DB;

/**
 * Creates, copies and saves setups. All multi-row writes run in one transaction so a
 * setup never ends up half-saved.
 */
final class SetupWriter
{
    /** A new setup with default settings and the nine built-in popups. */
    public function createBlank(User $user, string $name = 'New setup'): Setup
    {
        return DB::transaction(function () use ($user, $name): Setup {
            $setup = new Setup([
                'name' => mb_substr($name, 0, 60),
                'orientation' => 'landscape',
                'resolution' => '1080p',
                'camera' => SetupDefaults::camera(),
                'background' => SetupDefaults::background(),
                'foreground' => SetupDefaults::foreground(),
                'sound_settings' => SetupDefaults::soundSettings(),
                'output_settings' => SetupDefaults::outputSettings(),
                'scene' => SetupDefaults::scene(),
            ]);
            $setup->user()->associate($user);
            $setup->is_template = false;
            $setup->save();

            $this->syncPopups($setup, SetupDefaults::presetPopups());

            return $setup;
        });
    }

    /**
     * Copies a setup (one of the seller's own, or a starter template) into the seller's account.
     */
    public function duplicate(Setup $source, User $owner, ?string $name = null): Setup
    {
        return DB::transaction(function () use ($source, $owner, $name): Setup {
            $copy = $source->replicate(['user_id', 'is_template', 'description', 'scene_updated_at', 'created_at', 'updated_at']);
            $copy->name = mb_substr($name ?? $source->name, 0, 60);
            $copy->user()->associate($owner);
            $copy->is_template = false;

            // Image popups and sounds that point at someone else's uploads can't come along.
            $ownMedia = (int) $source->user_id === (int) $owner->id;
            if (! $ownMedia) {
                $background = $copy->background;
                $background['media_id'] = null;
                $copy->background = $background;
                $copy->foreground = array_merge(self::onlyKeys($copy->foreground ?? [], SetupDefaults::foreground()), ['media_id' => null, 'enabled' => false]);
                $scene = $copy->scene;
                $scene['background']['media_id'] = null;
                $scene['foreground'] = $copy->foreground;
                $scene['popups'] = array_values(array_filter($scene['popups'] ?? [], fn ($p) => ($p['kind'] ?? '') !== 'image'));
                $copy->scene = $scene;
            }
            $copy->save();

            $rows = $source->popups()->get()
                ->filter(fn (SetupPopup $p) => $ownMedia || $p->kind !== 'image')
                ->map(function (SetupPopup $p) use ($ownMedia): array {
                    $row = $p->only(['key', 'kind', 'preset_key', 'label', 'text', 'color', 'media_id', 'position', 'x', 'y', 'size', 'entrance', 'effect', 'effect_repeat', 'auto_hide', 'sound']);
                    if (! $ownMedia && Catalog::mediaIdFromSound($row['sound']) !== null) {
                        $row['sound'] = null;
                    }

                    return $row;
                })
                ->values()
                ->all();

            $this->syncPopups($copy, $rows);

            return $copy;
        });
    }

    /**
     * Saves the editor's whole document (already validated).
     *
     * @param  array<string, mixed>  $data
     */
    public function save(Setup $setup, array $data): Setup
    {
        return DB::transaction(function () use ($setup, $data): Setup {
            $setup->fill([
                'name' => $data['name'],
                'orientation' => $data['orientation'],
                'resolution' => $data['resolution'],
                'camera' => self::onlyKeys($data['camera'], SetupDefaults::camera()),
                'background' => self::onlyKeys($data['background'], SetupDefaults::background()),
                'foreground' => self::onlyKeys($data['foreground'] ?? [], SetupDefaults::foreground()),
                'sound_settings' => self::onlyKeys($data['sound_settings'], SetupDefaults::soundSettings()),
                'output_settings' => self::onlyKeys($data['output_settings'], SetupDefaults::outputSettings()),
            ]);
            // Always bump "last edited", even when only popups changed.
            $setup->updateTimestamps();
            $setup->save();

            $this->syncPopups($setup, $data['popups']);

            return $setup;
        });
    }

    /**
     * Replaces a setup's popups with the given list. Built-in popups can be re-styled but
     * never removed: any that are missing are put back with their defaults.
     *
     * @param  array<int, array<string, mixed>>  $popups
     */
    public function syncPopups(Setup $setup, array $popups): void
    {
        $rows = [];
        foreach ($popups as $popup) {
            $row = self::normalizePopup($popup);
            $rows[$row['key']] = $row;
        }
        foreach (Catalog::presetKeys() as $presetKey) {
            $rows[$presetKey] ??= SetupDefaults::presetPopup($presetKey);
        }

        $order = 0;
        $now = now();
        $values = [];
        foreach ($rows as $row) {
            $values[] = $row + [
                'setup_id' => $setup->id,
                'sort_order' => $order++,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        SetupPopup::query()
            ->where('setup_id', $setup->id)
            ->whereNotIn('key', array_keys($rows))
            ->delete();

        SetupPopup::query()->upsert(
            $values,
            ['setup_id', 'key'],
            ['kind', 'preset_key', 'label', 'text', 'color', 'media_id', 'position', 'x', 'y', 'size', 'entrance', 'effect', 'effect_repeat', 'auto_hide', 'sound', 'sort_order', 'updated_at'],
        );
    }

    /**
     * Brings one validated popup into its canonical stored form.
     *
     * @param  array<string, mixed>  $popup
     * @return array<string, mixed>
     */
    public static function normalizePopup(array $popup): array
    {
        $kind = $popup['kind'];
        [$x, $y] = Catalog::popupPoint($popup['x'] ?? null, $popup['y'] ?? null);
        $base = [
            'key' => $popup['key'],
            'kind' => $kind,
            'preset_key' => null,
            'label' => null,
            'text' => null,
            'color' => null,
            'media_id' => null,
            'position' => $popup['position'],
            'x' => $x,
            'y' => $y,
            'size' => Catalog::popupSize($popup['size']),
            'entrance' => $popup['entrance'],
            'effect' => $popup['effect'],
            'effect_repeat' => $popup['effect_repeat'],
            'auto_hide' => (int) ($popup['auto_hide'] ?? 0),
            'sound' => $popup['sound'] ?? null,
        ];

        return match ($kind) {
            'preset' => array_merge($base, [
                'preset_key' => $popup['preset_key'],
                'label' => Catalog::PRESET_POPUPS[$popup['preset_key']]['label'],
            ]),
            'text' => array_merge($base, [
                'text' => trim((string) $popup['text']),
                'label' => trim((string) $popup['text']),
                'color' => $popup['color'],
            ]),
            'image' => array_merge($base, [
                'media_id' => (int) $popup['media_id'],
                'label' => trim((string) ($popup['label'] ?? '')) ?: 'Image',
            ]),
        };
    }

    /**
     * Keeps only the known keys of a settings group, in a stable order.
     *
     * @param  array<string, mixed>  $values
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public static function onlyKeys(array $values, array $defaults): array
    {
        $out = [];
        foreach ($defaults as $key => $default) {
            $out[$key] = array_key_exists($key, $values) ? $values[$key] : $default;
        }

        return $out;
    }
}
