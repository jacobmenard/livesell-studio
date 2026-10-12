<?php

namespace App\Http\Resources;

use App\Models\StreamDestination;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A saved RTMP destination. The stream key itself is never sent back.
 *
 * @mixin StreamDestination
 */
class DestinationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'platform' => $this->platform,
            'server_url' => $this->server_url,
            'key_hint' => $this->keyHint(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
