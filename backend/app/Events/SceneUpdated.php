<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * The editor changed what is on screen. Sent straight away (not queued) so popups
 * appear on the live within a fraction of a second.
 */
class SceneUpdated implements ShouldBroadcastNow
{
    /**
     * @param  array<string, mixed>  $scene  resolved scene (media ids already turned into URLs)
     */
    public function __construct(
        public readonly int $setupId,
        public readonly ?string $outputPublicId,
        public readonly array $scene,
    ) {}

    /** @return array<int, PrivateChannel> */
    public function broadcastOn(): array
    {
        return LiveChannels::for($this->setupId, $this->outputPublicId);
    }

    public function broadcastAs(): string
    {
        return 'scene.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['scene' => $this->scene];
    }
}
