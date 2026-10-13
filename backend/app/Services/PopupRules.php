<?php

namespace App\Services;

use App\Support\Catalog;
use Illuminate\Validation\Rule;

/**
 * Validation rules shared by the saved setup document and the live scene, so both
 * accept exactly the same popup vocabulary.
 */
final class PopupRules
{
    /** Printable text only: no control characters (text is always rendered as plain text). */
    private const PLAIN_TEXT = 'not_regex:/[\x00-\x1F\x7F]/u';

    /**
     * @param  string  $prefix  e.g. "popups" or "scene.popups"
     * @param  bool  $forScene  scene popups carry shown_at; saved popups carry auto_hide and sound
     */
    public static function rules(string $prefix, bool $forScene): array
    {
        $fields = ['key', 'kind', 'preset_key', 'label', 'text', 'color', 'media_id', 'position', 'x', 'y', 'size', 'entrance', 'effect', 'effect_repeat'];
        $fields = array_merge($fields, $forScene ? ['shown_at'] : ['auto_hide', 'sound']);
        $max = $forScene ? Catalog::MAX_POPUPS_ON_SCREEN : Catalog::MAX_POPUPS_PER_SETUP;
        $item = "{$prefix}.*";

        $rules = [
            $prefix => ['present', 'array', "max:{$max}"],
            $item => ['array:'.implode(',', $fields)],
            "{$item}.key" => ['required', 'string', 'regex:'.Catalog::POPUP_KEY_PATTERN, 'distinct'],
            "{$item}.kind" => ['required', Rule::in(Catalog::POPUP_KINDS)],
            "{$item}.preset_key" => ['nullable', "required_if:{$item}.kind,preset", Rule::in(Catalog::presetKeys())],
            "{$item}.label" => ['nullable', 'string', 'max:24', self::PLAIN_TEXT],
            "{$item}.text" => ['nullable', "required_if:{$item}.kind,text", 'string', 'max:24', self::PLAIN_TEXT],
            "{$item}.color" => ['nullable', "required_if:{$item}.kind,text", Rule::in(Catalog::TEXT_COLORS)],
            "{$item}.media_id" => ['nullable', "required_if:{$item}.kind,image", 'integer', 'min:1'],
            "{$item}.position" => ['required', Rule::in(Catalog::POSITIONS)],
            // Dragged on the preview: the popup's centre as a % of the stage (both or neither).
            "{$item}.x" => ['nullable', "required_with:{$item}.y", 'numeric', 'between:0,100'],
            "{$item}.y" => ['nullable', "required_with:{$item}.x", 'numeric', 'between:0,100'],
            "{$item}.size" => ['required', 'integer', 'between:'.Catalog::POPUP_SIZE_MIN.','.Catalog::POPUP_SIZE_MAX],
            "{$item}.entrance" => ['required', Rule::in(Catalog::ENTRANCES)],
            "{$item}.effect" => ['required', Rule::in(Catalog::EFFECTS)],
            "{$item}.effect_repeat" => ['required', Rule::in(Catalog::EFFECT_REPEATS)],
        ];

        if ($forScene) {
            $rules["{$item}.shown_at"] = ['required', 'integer', 'min:0'];
        } else {
            $rules["{$item}.auto_hide"] = ['required', 'integer', Rule::in(Catalog::AUTO_HIDE_SECONDS)];
            $rules["{$item}.sound"] = ['nullable', 'string', 'max:32', self::soundRule()];
        }

        return $rules;
    }

    /** A built-in sound id or "media:<id>" (ownership is checked separately). */
    public static function soundRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if (! is_string($value)) {
                $fail('Pick a sound from the list.');

                return;
            }
            if (! in_array($value, Catalog::SOUNDS, true) && preg_match(Catalog::MEDIA_SOUND_PATTERN, $value) !== 1) {
                $fail('Pick a sound from the list.');
            }
        };
    }

    /**
     * Rules for the stage-level parts of a document (shape, camera, background).
     */
    public static function stageRules(string $prefix = ''): array
    {
        $p = $prefix === '' ? '' : "{$prefix}.";

        return [
            "{$p}orientation" => ['required', Rule::in(Catalog::ORIENTATIONS)],
            "{$p}camera" => ['required', 'array:source,device_label,mirror,brightness,contrast,saturation,warmth,smoothing,zoom,audio'],
            "{$p}camera.source" => ['required', Rule::in(Catalog::CAMERA_SOURCES)],
            "{$p}camera.device_label" => ['nullable', 'string', 'max:120', self::PLAIN_TEXT],
            "{$p}camera.mirror" => ['required', 'boolean'],
            "{$p}camera.brightness" => ['required', 'integer', 'between:0,100'],
            // The camera look; optional so editors opened before these existed can still save.
            "{$p}camera.contrast" => ['sometimes', 'integer', 'between:0,100'],
            "{$p}camera.saturation" => ['sometimes', 'integer', 'between:0,100'],
            "{$p}camera.warmth" => ['sometimes', 'integer', 'between:0,100'],
            "{$p}camera.smoothing" => ['sometimes', 'integer', 'between:0,100'],
            // Below 0 zooms out (portrait only in the editor; landscape ignores it).
            "{$p}camera.zoom" => ['required', 'integer', 'between:-100,100'],
            // Optional so editors opened before camera sound existed can still save.
            "{$p}camera.audio" => ['sometimes', 'boolean'],
            "{$p}background" => ['required', 'array:mode,preset,media_id,key_color,similarity,smoothness'],
            "{$p}background.mode" => ['required', Rule::in(Catalog::BACKGROUND_MODES)],
            "{$p}background.preset" => ['required', Rule::in(Catalog::backgroundPresetKeys())],
            "{$p}background.media_id" => ['nullable', 'integer', 'min:1'],
            "{$p}background.key_color" => ['required', Rule::in(Catalog::KEY_COLORS)],
            "{$p}background.similarity" => ['required', 'integer', 'between:0,100'],
            "{$p}background.smoothness" => ['required', 'integer', 'between:0,100'],
            // Optional so editors opened before foregrounds existed can still save.
            "{$p}foreground" => ['sometimes', 'array:enabled,media_id,dock'],
            "{$p}foreground.enabled" => ["required_with:{$p}foreground", 'boolean'],
            "{$p}foreground.media_id" => ['nullable', 'integer', 'min:1'],
            "{$p}foreground.dock" => ["required_with:{$p}foreground", Rule::in(Catalog::FOREGROUND_DOCKS)],
        ];
    }
}
