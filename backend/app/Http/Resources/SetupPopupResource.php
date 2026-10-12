<?php

namespace App\Http\Resources;

use App\Models\SetupPopup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SetupPopup */
class SetupPopupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->key,
            'kind' => $this->kind,
            'preset_key' => $this->preset_key,
            'label' => $this->label,
            'text' => $this->text,
            'color' => $this->color,
            'media_id' => $this->media_id,
            'media_url' => $this->whenLoaded('media', fn () => $this->media?->url),
            'position' => $this->position,
            'x' => $this->x,
            'y' => $this->y,
            'size' => $this->size,
            'entrance' => $this->entrance,
            'effect' => $this->effect,
            'effect_repeat' => $this->effect_repeat,
            'auto_hide' => $this->auto_hide,
            'sound' => $this->sound,
        ];
    }
}
