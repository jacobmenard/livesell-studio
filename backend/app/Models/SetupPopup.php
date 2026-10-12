<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One popup inside a setup: a built-in preset, a typed text popup or an uploaded image.
 *
 * @property int $id
 * @property int $setup_id
 * @property string $key
 * @property string $kind
 * @property string|null $preset_key
 * @property string $label
 * @property string|null $text
 * @property string|null $color
 * @property int|null $media_id
 * @property string $position
 * @property float|null $x centre, % of the stage width (null = use $position)
 * @property float|null $y centre, % of the stage height
 * @property int $size percentage of the original "Medium" (see Catalog::POPUP_SIZE_*)
 * @property string $entrance
 * @property string $effect
 * @property string $effect_repeat
 * @property int $auto_hide
 * @property string|null $sound
 * @property int $sort_order
 */
class SetupPopup extends Model
{
    protected $fillable = [
        'key',
        'kind',
        'preset_key',
        'label',
        'text',
        'color',
        'media_id',
        'position',
        'x',
        'y',
        'size',
        'entrance',
        'effect',
        'effect_repeat',
        'auto_hide',
        'sound',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'media_id' => 'integer',
            'x' => 'float',
            'y' => 'float',
            'size' => 'integer',
            'auto_hide' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<Setup, $this> */
    public function setup(): BelongsTo
    {
        return $this->belongsTo(Setup::class);
    }

    /** @return BelongsTo<Media, $this> */
    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }
}
