<?php

namespace App\Services;

use App\Events\SceneUpdated;
use App\Events\SoundPlayed;
use App\Models\Setup;
use Throwable;

/**
 * Pushes live changes to the clean screen over Reverb. Sending is best effort: the
 * scene is already saved, so if the WebSocket server is down the clean screen still
 * catches up from its fallback poll. Failures are reported, never swallowed silently.
 */
final class LiveRelay
{
    public function __construct(private readonly SceneResolver $resolver) {}

    /** @return bool whether the update reached the WebSocket server */
    public function publishScene(Setup $setup): bool
    {
        $scene = $this->resolver->resolve($setup);

        return $this->send(fn () => event(new SceneUpdated($setup->id, $this->outputId($setup), $scene)));
    }

    public function publishSound(Setup $setup, string $sound, ?string $url, int $volume): bool
    {
        return $this->send(fn () => event(new SoundPlayed($setup->id, $this->outputId($setup), $sound, $url, $volume)));
    }

    private function outputId(Setup $setup): ?string
    {
        return $setup->outputLinks()->active()->latest('id')->value('public_id');
    }

    private function send(callable $dispatch): bool
    {
        try {
            $dispatch();

            return true;
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }
}
