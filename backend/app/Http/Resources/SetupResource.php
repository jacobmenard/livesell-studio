<?php

namespace App\Http\Resources;

use App\Models\Setup;
use App\Services\SetupDefaults;
use App\Services\SetupWriter;
use App\Support\Catalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A setup for a dashboard card ($full = false) or the editor ($full = true).
 * The scene is passed in already resolved (see SceneResolver) so media URLs for a
 * whole list are looked up with one query.
 *
 * Expects the "linked_sounds_count" aggregate to be loaded (withCount).
 *
 * @mixin Setup
 */
class SetupResource extends JsonResource
{
    /** @param array<string, mixed> $resolvedScene */
    public function __construct(Setup $resource, private readonly array $resolvedScene, private readonly bool $full = false)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'is_template' => $this->is_template,
            'orientation' => $this->orientation,
            'resolution' => $this->resolution,
            'background_label' => $this->backgroundLabel(),
            'linked_sounds' => (int) ($this->linked_sounds_count ?? 0),
            'scene' => $this->resolvedScene,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];

        if ($this->full) {
            $data += [
                // Filled with defaults so setups saved before a camera setting existed get it too.
                'camera' => SetupWriter::onlyKeys($this->camera ?? [], SetupDefaults::camera()),
                'background' => $this->background,
                'foreground' => SetupWriter::onlyKeys($this->foreground ?? [], SetupDefaults::foreground()),
                'sound_settings' => $this->sound_settings,
                'output_settings' => $this->output_settings,
                'popups' => SetupPopupResource::collection($this->whenLoaded('popups')),
            ];
        }

        return $data;
    }

    private function backgroundLabel(): string
    {
        $bg = $this->background ?? [];

        return match ($bg['mode'] ?? 'image') {
            'none' => 'Your real room',
            'blur' => 'Blurred room',
            default => ! empty($bg['media_id'])
                ? 'Your photo'
                : (Catalog::BACKGROUND_PRESETS[$bg['preset'] ?? 'rack'] ?? 'Boutique rack'),
        };
    }
}
