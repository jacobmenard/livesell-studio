<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * A sound pad was tapped with "Send to live" on: the clean screen plays it so it is
 * mixed into the stream (OBS / TikTok LIVE Studio capture the Browser Source audio).
 */
class SoundPlayed implements ShouldBroadcastNow
{
    public function __construct(
        public readonly int $setupId,
        public readonly ?string $outputPublicId,
        public readonly string $sound,
        public readonly ?string $url,
        public readonly int $volume,
    ) {}

    /** @return array<int, PrivateChannel> */
    public function broadcastOn(): array
    {
        return LiveChannels::for($this->setupId, $this->outputPublicId);
    }

    public function broadcastAs(): string
    {
        return 'sound.played';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'sound' => $this->sound,
            'url' => $this->url,
            'volume' => $this->volume,
        ];
    }
}
