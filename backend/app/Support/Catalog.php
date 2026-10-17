<?php

namespace App\Support;

/**
 * The fixed vocabulary a setup can use. The React app ships the matching look
 * (colors, shapes, sounds) in src/stage/catalog.ts; the API only accepts these keys,
 * so a client can never smuggle arbitrary styles, URLs or markup into a scene.
 */
final class Catalog
{
    /** Built-in popups with their default placement and effect. */
    public const PRESET_POPUPS = [
        'off10' => ['label' => '10% OFF', 'position' => 'tr', 'effect' => 'fireworks', 'effect_repeat' => 'loop'],
        'live' => ['label' => 'LIVE TODAY', 'position' => 'tl', 'effect' => 'sparkle', 'effect_repeat' => 'loop'],
        'free' => ['label' => 'FREE', 'position' => 'br', 'effect' => 'confetti', 'effect_repeat' => 'once'],
        'b1t1' => ['label' => 'BUY 1 TAKE 1', 'position' => 'bl', 'effect' => 'applause', 'effect_repeat' => 'once'],
        'ship' => ['label' => 'FREE SHIPPING', 'position' => 'tc', 'effect' => 'none', 'effect_repeat' => 'once'],
        'flash' => ['label' => 'FLASH SALE', 'position' => 'mc', 'effect' => 'flags', 'effect_repeat' => 'once'],
        'last' => ['label' => 'LAST 5 PCS', 'position' => 'mr', 'effect' => 'none', 'effect_repeat' => 'once'],
        'sold' => ['label' => 'SOLD OUT', 'position' => 'mc', 'effect' => 'none', 'effect_repeat' => 'once'],
        'new' => ['label' => 'NEW', 'position' => 'ml', 'effect' => 'hearts', 'effect_repeat' => 'once'],
    ];

    public const POPUP_KINDS = ['preset', 'text', 'image'];

    public const TEXT_COLORS = ['yellow', 'coral', 'blue', 'white'];

    public const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

    /** Where the foreground image docks: across the top or the bottom of the stage. */
    public const FOREGROUND_DOCKS = ['top', 'bottom'];

    /** Popup size, free between these limits: a percentage of the original "Medium". */
    public const POPUP_SIZE_MIN = 40;

    // A safety ceiling only: the editor stops resizing once a popup fills the screen, which
    // for the smallest badge is about 900% (landscape).
    public const POPUP_SIZE_MAX = 1500;

    public const POPUP_SIZE_DEFAULT = 100;

    /** What the old Small / Medium / Large choices became (text keeps its exact size). */
    public const LEGACY_POPUP_SIZES = ['S' => 65, 'M' => 100, 'L' => 158];

    public const ENTRANCES = ['pop', 'slide', 'bounce', 'none'];

    public const EFFECTS = ['none', 'fireworks', 'confetti', 'flags', 'applause', 'sparkle', 'hearts'];

    public const EFFECT_REPEATS = ['once', 'loop'];

    public const AUTO_HIDE_SECONDS = [0, 3, 5, 10];

    public const SOUNDS = [
        'laugh', 'applause', 'bang', 'gun', 'drumroll', 'airhorn', 'kaching',
        'ding', 'boo', 'wow', 'crickets', 'rimshot', 'fireworks',
    ];

    public const BACKGROUND_MODES = ['none', 'blur', 'image', 'green'];

    public const BACKGROUND_PRESETS = [
        'loft' => 'Studio loft',
        'rack' => 'Boutique rack',
        'kitchen' => 'Kitchen set',
        'vanity' => 'Vanity corner',
        'brand' => 'Brand wall',
        'white' => 'Clean white',
    ];

    public const KEY_COLORS = ['green', 'blue'];

    public const ORIENTATIONS = ['landscape', 'portrait'];

    public const RESOLUTIONS = ['720p', '1080p'];

    public const CAMERA_SOURCES = ['camera', 'phone'];

    /** Face-tracked camera effects (frontend src/stage/faceEffects.ts). */
    public const FACE_EFFECTS = [
        'none', 'glam', 'natural-makeup', 'fresh-face', 'nude-glow', 'rosy-cheeks', 'peach-fresh', 'coral-summer',
        'soft-berry', 'mlbb', 'k-beauty', 'bronzed', 'evening-glam', 'pink-doll', 'glow-eyes', 'flower-crown', 'butterflies', 'puppy', 'bunny', 'kitty', 'bear', 'heart-eyes', 'star-eyes',
        'money-eyes', 'shades', 'crown', 'halo', 'devil', 'blush', 'sparkles', 'love-hearts', 'crying',
        'clown', 'mustache', 'piggy', 'cowboy', 'party', 'rainbow',
    ];

    public const OUTPUT_METHODS = ['window', 'rtmp', 'vcam'];

    public const THEMES = ['light', 'dark', 'system'];

    public const PLATFORMS = ['facebook', 'youtube', 'tiktok', 'custom'];

    // "foreground" images are kept apart from popup "image" uploads (own library and picker).
    public const MEDIA_KINDS = ['image', 'background', 'foreground', 'sound'];

    /** Key a popup or sound reference uses for a seller's own uploaded sound. */
    public const MEDIA_SOUND_PATTERN = '/^media:(\d{1,18})$/';

    /** Stable client-side key for a popup inside one setup. */
    public const POPUP_KEY_PATTERN = '/^[a-z0-9][a-z0-9-]{0,39}$/';

    /** Most popups a scene may show at once (keeps broadcast payloads small). */
    public const MAX_POPUPS_ON_SCREEN = 12;

    /** Most popups (built-in + own) one setup may hold. */
    public const MAX_POPUPS_PER_SETUP = 60;

    public static function presetKeys(): array
    {
        return array_keys(self::PRESET_POPUPS);
    }

    public static function backgroundPresetKeys(): array
    {
        return array_keys(self::BACKGROUND_PRESETS);
    }

    /** Returns the media id from a "media:123" sound reference, or null for a built-in sound. */
    public static function mediaIdFromSound(?string $sound): ?int
    {
        if ($sound !== null && preg_match(self::MEDIA_SOUND_PATTERN, $sound, $m) === 1) {
            return (int) $m[1];
        }

        return null;
    }

    /** A popup size from stored data: old S / M / L letters become percentages, numbers stay in range. */
    public static function popupSize(mixed $size): int
    {
        if (is_string($size) && isset(self::LEGACY_POPUP_SIZES[$size])) {
            return self::LEGACY_POPUP_SIZES[$size];
        }
        if (! is_numeric($size)) {
            return self::POPUP_SIZE_DEFAULT;
        }

        return max(self::POPUP_SIZE_MIN, min(self::POPUP_SIZE_MAX, (int) round((float) $size)));
    }

    /**
     * Where a popup was dragged to (its centre, % of the stage), or [null, null] to use its
     * 9-spot position. Both coordinates must be set for either to count.
     *
     * @return array{0: float|null, 1: float|null}
     */
    public static function popupPoint(mixed $x, mixed $y): array
    {
        if (! is_numeric($x) || ! is_numeric($y)) {
            return [null, null];
        }
        $clamp = fn ($v): float => round(max(0.0, min(100.0, (float) $v)), 2);

        return [$clamp($x), $clamp($y)];
    }
}
