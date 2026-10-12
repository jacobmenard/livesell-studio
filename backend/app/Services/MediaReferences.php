<?php

namespace App\Services;

use App\Models\Media;
use App\Models\User;
use App\Support\Catalog;
use Illuminate\Validation\Validator;

/**
 * Checks that every uploaded file a document points at belongs to the seller and is
 * the right kind, using one query for the whole document.
 */
final class MediaReferences
{
    /**
     * @param  array<int, array<string, mixed>>  $popups
     * @param  array<string, mixed>|null  $background
     * @param  array<string, mixed>|null  $foreground
     */
    public static function validate(
        Validator $validator,
        User $user,
        array $popups,
        ?array $background,
        string $popupPrefix,
        string $backgroundPrefix,
        ?array $foreground = null,
        string $foregroundPrefix = 'foreground',
    ): void {
        /** @var array<string, array{0:int, 1:string}> $wanted attribute => [media id, required kind] */
        $wanted = [];

        foreach ($popups as $i => $popup) {
            if (! is_array($popup)) {
                continue;
            }
            if (($popup['kind'] ?? null) === 'image' && isset($popup['media_id']) && is_numeric($popup['media_id'])) {
                $wanted["{$popupPrefix}.{$i}.media_id"] = [(int) $popup['media_id'], 'image'];
            }
            $soundId = is_string($popup['sound'] ?? null) ? Catalog::mediaIdFromSound($popup['sound']) : null;
            if ($soundId !== null) {
                $wanted["{$popupPrefix}.{$i}.sound"] = [$soundId, 'sound'];
            }
            // A built-in popup's key is its preset name, so presets can't be duplicated.
            if (($popup['kind'] ?? null) === 'preset' && ($popup['key'] ?? null) !== ($popup['preset_key'] ?? null)) {
                $validator->errors()->add("{$popupPrefix}.{$i}.key", 'A built-in popup keeps its own key.');
            }
        }

        if (is_array($background) && isset($background['media_id']) && is_numeric($background['media_id'])) {
            $wanted["{$backgroundPrefix}.media_id"] = [(int) $background['media_id'], 'background'];
        }

        // The foreground has its own uploads, kept apart from popup images.
        if (is_array($foreground) && isset($foreground['media_id']) && is_numeric($foreground['media_id'])) {
            $wanted["{$foregroundPrefix}.media_id"] = [(int) $foreground['media_id'], 'foreground'];
        }

        if ($wanted === []) {
            return;
        }

        $ids = array_values(array_unique(array_map(fn (array $w) => $w[0], $wanted)));
        $owned = Media::query()->ownedBy($user->accountId())->whereIn('id', $ids)->pluck('kind', 'id');

        foreach ($wanted as $attribute => [$id, $kind]) {
            if (($owned[$id] ?? null) !== $kind) {
                $validator->errors()->add($attribute, 'That file is not in your uploads.');
            }
        }
    }
}
