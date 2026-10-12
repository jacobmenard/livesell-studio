<?php

namespace App\Services;

use App\Events\SceneUpdated;
use App\Events\SoundPlayed;
use App\Models\Setup;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Pushes live changes to the clean screen over Reverb. Sending is best effort: the
 * scene is already saved, so if the WebSocket server is down the clean screen still
 * catches up from its fallback poll. Failures are reported, never swallowed silently.
 *
 * A popup tap must never wait on a WebSocket server that isn't there: without Reverb keys
 * nothing is sent, and after a failed send the next ones are skipped for a few seconds
 * (connecting to a closed port alone takes about 2 s on Windows).
 */
final class LiveRelay
{
    private const DOWN_KEY = 'live-relay:down';

    private const RETRY_AFTER_SECONDS = 15;

    public function __construct(private readonly SceneResolver $resolver) {}

    /** @return bool whether the update reached the WebSocket server */
    public function publishScene(Setup $setup): bool
    {
        if (! $this->available()) {
            return false;
        }
        $scene = $this->resolver->resolve($setup);

        return $this->send(fn () => event(new SceneUpdated($setup->id, $this->outputId($setup), $scene)));
    }

    public function publishSound(Setup $setup, string $sound, ?string $url, int $volume): bool
    {
        if (! $this->available()) {
            return false;
        }

        return $this->send(fn () => event(new SoundPlayed($setup->id, $this->outputId($setup), $sound, $url, $volume)));
    }

    /** Reverb is set up and didn't just fail (other broadcast drivers never wait on a socket). */
    private function available(): bool
    {
        if (config('broadcasting.default') === 'reverb' && blank(config('broadcasting.connections.reverb.key'))) {
            return false;
        }

        return ! Cache::has(self::DOWN_KEY);
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
            Cache::put(self::DOWN_KEY, true, self::RETRY_AFTER_SECONDS);
            report($e);

            return false;
        }
    }
}
