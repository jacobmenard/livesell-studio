<?php

namespace App\Services;

use App\Models\Media;
use App\Models\Setup;
use App\Support\Catalog;
use Illuminate\Support\Collection;

/**
 * Turns a stored scene into what the clean screen draws: media ids become URLs, and
 * anything pointing at a file the owner no longer has is dropped. Looks up all files
 * for many setups in a single query.
 */
final class SceneResolver
{
    /**
     * @param  iterable<Setup>  $setups
     * @return array<int, array<string, mixed>> resolved scene keyed by setup id
     */
    public function resolveMany(iterable $setups): array
    {
        $setups = collect($setups);
        $ids = $setups->flatMap(fn (Setup $s) => self::mediaIds($s->scene ?? []))->unique()->values();

        /** @var Collection<int, Media> $media */
        $media = $ids->isEmpty()
            ? collect()
            : Media::query()->whereIn('id', $ids)->get()->keyBy('id');

        $out = [];
        foreach ($setups as $setup) {
            $out[$setup->id] = self::resolveScene($setup->scene ?? [], $setup->user_id, $media);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function resolve(Setup $setup): array
    {
        return $this->resolveMany([$setup])[$setup->id];
    }

    /**
     * @param  array<string, mixed>  $scene
     * @param  Collection<int, Media>  $media
     * @return array<string, mixed>
     */
    public static function resolveScene(array $scene, ?int $ownerId, Collection $media): array
    {
        $find = function (mixed $id, string $kind) use ($media, $ownerId): ?Media {
            $item = is_numeric($id) ? $media->get((int) $id) : null;

            return $item && $ownerId !== null && (int) $item->user_id === $ownerId && $item->kind === $kind ? $item : null;
        };

        $defaults = SetupDefaults::scene();
        $background = SetupWriter::onlyKeys($scene['background'] ?? [], SetupDefaults::background());
        $bgMedia = $find($background['media_id'], 'background');
        $background['media_id'] = $bgMedia?->id;
        $background['media_url'] = $bgMedia?->url;

        // Scenes saved before foregrounds existed have none: it reads as off.
        $foreground = SetupWriter::onlyKeys(is_array($scene['foreground'] ?? null) ? $scene['foreground'] : [], SetupDefaults::foreground());
        $foregroundMedia = $find($foreground['media_id'], 'foreground');
        $foreground['media_id'] = $foregroundMedia?->id;
        $foreground['media_url'] = $foregroundMedia?->url;

        $popups = [];
        foreach ($scene['popups'] ?? [] as $popup) {
            if (! is_array($popup)) {
                continue;
            }
            $url = null;
            if (($popup['kind'] ?? null) === 'image') {
                $item = $find($popup['media_id'] ?? null, 'image');
                if (! $item) {
                    continue;
                }
                $url = $item->url;
            }
            [$x, $y] = Catalog::popupPoint($popup['x'] ?? null, $popup['y'] ?? null);
            $popups[] = [
                'key' => $popup['key'],
                'kind' => $popup['kind'],
                'preset_key' => $popup['preset_key'] ?? null,
                'label' => $popup['label'] ?? null,
                'text' => $popup['text'] ?? null,
                'color' => $popup['color'] ?? null,
                'media_id' => $popup['media_id'] ?? null,
                'media_url' => $url,
                'position' => $popup['position'],
                'x' => $x,
                'y' => $y,
                // Live scenes saved before free sizing still say S / M / L.
                'size' => Catalog::popupSize($popup['size'] ?? null),
                'entrance' => $popup['entrance'],
                'effect' => $popup['effect'],
                'effect_repeat' => $popup['effect_repeat'],
                'shown_at' => (int) ($popup['shown_at'] ?? 0),
            ];
        }

        return [
            'orientation' => $scene['orientation'] ?? $defaults['orientation'],
            'see_through' => (bool) ($scene['see_through'] ?? false),
            'camera' => SetupWriter::onlyKeys($scene['camera'] ?? [], $defaults['camera']),
            'background' => $background,
            'foreground' => $foreground,
            'popups' => $popups,
        ];
    }

    /**
     * @param  array<string, mixed>  $scene
     * @return array<int, int>
     */
    private static function mediaIds(array $scene): array
    {
        $ids = [];
        if (is_numeric($scene['background']['media_id'] ?? null)) {
            $ids[] = (int) $scene['background']['media_id'];
        }
        if (is_numeric($scene['foreground']['media_id'] ?? null)) {
            $ids[] = (int) $scene['foreground']['media_id'];
        }
        foreach ($scene['popups'] ?? [] as $popup) {
            if (is_array($popup) && is_numeric($popup['media_id'] ?? null)) {
                $ids[] = (int) $popup['media_id'];
            }
        }

        return $ids;
    }
}
