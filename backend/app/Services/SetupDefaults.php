<?php

namespace App\Services;

use App\Support\Catalog;

/**
 * Starting values for a brand-new setup. Mirrors the defaults in the React editor.
 */
final class SetupDefaults
{
    public static function camera(): array
    {
        return [
            'source' => 'camera',
            'device_label' => null,
            'mirror' => false,
            // The camera's look, 0–100: 50 leaves the picture unchanged, smoothing 0 is off.
            'brightness' => 50,
            'contrast' => 50,
            'saturation' => 50,
            'warmth' => 50,
            'smoothing' => 0,
            // A face-tracked effect on the camera (Catalog::FACE_EFFECTS).
            'effect' => 'none',
            // A colour filter for the whole picture (Catalog::CAMERA_FILTERS) and its strength.
            'filter' => 'none',
            'filter_strength' => 80,
            'zoom' => 0,
            // Send the camera's own sound (or the default microphone) with the clean screen.
            'audio' => true,
        ];
    }

    public static function background(): array
    {
        return [
            'mode' => 'image',
            'preset' => 'rack',
            'media_id' => null,
            'key_color' => 'green',
            'similarity' => 42,
            'smoothness' => 18,
        ];
    }

    public static function soundSettings(): array
    {
        return [
            'volume' => 70,
            'to_stream' => true,
            'monitor' => true,
        ];
    }

    public static function outputSettings(): array
    {
        return [
            'method' => 'window',
            'see_through' => false,
            'safe_zones' => false,
        ];
    }

    /** A full-width image docked to the top or bottom of the stage; off until an image is picked. */
    public static function foreground(): array
    {
        return [
            'enabled' => false,
            'media_id' => null,
            'dock' => 'bottom',
        ];
    }

    /**
     * The live scene: everything the clean screen needs to draw, nothing else.
     *
     * @param  array<int, array<string, mixed>>  $popups
     */
    public static function scene(
        string $orientation = 'landscape',
        ?array $camera = null,
        ?array $background = null,
        bool $seeThrough = false,
        array $popups = [],
        ?array $foreground = null,
    ): array {
        // Settings added later fall back to their defaults for setups saved before them.
        $camera = SetupWriter::onlyKeys($camera ?? [], self::camera());

        return [
            'orientation' => $orientation,
            'see_through' => $seeThrough,
            'camera' => $camera,
            'background' => $background ?? self::background(),
            'foreground' => $foreground ?? self::foreground(),
            'popups' => $popups,
        ];
    }

    /** Row values for a built-in popup with its catalog defaults. */
    public static function presetPopup(string $presetKey): array
    {
        $preset = Catalog::PRESET_POPUPS[$presetKey];

        return [
            'key' => $presetKey,
            'kind' => 'preset',
            'preset_key' => $presetKey,
            'label' => $preset['label'],
            'text' => null,
            'color' => null,
            'media_id' => null,
            'position' => $preset['position'],
            'x' => null,
            'y' => null,
            'size' => Catalog::POPUP_SIZE_DEFAULT,
            'entrance' => 'pop',
            'effect' => $preset['effect'],
            'effect_repeat' => $preset['effect_repeat'],
            'auto_hide' => 0,
            'sound' => null,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public static function presetPopups(): array
    {
        return array_map(self::presetPopup(...), Catalog::presetKeys());
    }
}
