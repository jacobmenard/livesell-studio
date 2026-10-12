<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;

/**
 * Where live updates go: the owner's channel (their own clean-screen window) and, if
 * one exists, the private Browser Source link's channel.
 */
final class LiveChannels
{
    /** @return array<int, PrivateChannel> */
    public static function for(int $setupId, ?string $outputPublicId): array
    {
        $channels = [new PrivateChannel('setup.'.$setupId)];
        if ($outputPublicId !== null) {
            $channels[] = new PrivateChannel('output.'.$outputPublicId);
        }

        return $channels;
    }
}
