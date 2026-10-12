<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setup;
use App\Models\StreamDestination;
use App\Services\LiveSessions;
use App\Support\Catalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Streaming straight to a saved RTMP(S) destination. Browsers can't speak RTMP, so the
 * clean screen sends its picture to the local relay (relay/), which runs FFmpeg.
 *
 * The stream key never reaches the browser: the seller gets a short-lived, one-time
 * ticket, and only the relay (which holds RELAY_SECRET) can swap it for the server and key.
 */
class BroadcastController extends Controller
{
    private const TICKET_PREFIX = 'broadcast-ticket:';

    private const TICKET_LENGTH = 48;

    public function __construct(private readonly LiveSessions $liveSessions) {}

    public function store(Request $request, Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);
        $data = $request->validate([
            'platform' => ['required', Rule::in(Catalog::PLATFORMS)],
            'orientation' => ['required', Rule::in(Catalog::ORIENTATIONS)],
            'resolution' => ['required', Rule::in(Catalog::RESOLUTIONS)],
        ]);

        abort_unless(
            $this->relaySecret() !== '',
            503,
            'Streaming straight from NegosyoWork Studio is not set up on this computer yet (RELAY_SECRET is missing).',
        );

        // Streaming goes out from an open clean screen, which holds the plan's live slot.
        abort_unless($this->liveSessions->isLive($setup), 409, 'Open the clean screen for this setup first, then start streaming from it.');

        // The account's saved key: a sub-user streams with it without ever seeing it.
        $destination = $request->user()->accountOwner()->streamDestinations()->where('platform', $data['platform'])->first();
        if (! $destination) {
            throw ValidationException::withMessages(['platform' => 'Save the server URL and stream key for this platform first.']);
        }

        // Only the ticket's hash is stored, and only ids: the key stays encrypted in its table.
        $ticket = Str::random(self::TICKET_LENGTH);
        Cache::put(self::TICKET_PREFIX.hash('sha256', $ticket), [
            'destination_id' => $destination->id,
            'orientation' => $data['orientation'],
            'resolution' => $data['resolution'],
        ], now()->addSeconds((int) config('livesell.broadcast_ticket_ttl')));

        return response()->json(['data' => ['ticket' => $ticket]], 201);
    }

    /** Called by the relay only: swaps a ticket, once, for where and how to stream. */
    public function claim(Request $request): JsonResponse
    {
        $secret = $this->relaySecret();
        abort_unless($secret !== '', 503, 'RELAY_SECRET is not set.');
        abort_unless(hash_equals($secret, (string) $request->bearerToken()), 401);

        $data = $request->validate(['ticket' => ['required', 'string', 'size:'.self::TICKET_LENGTH]]);

        $payload = Cache::pull(self::TICKET_PREFIX.hash('sha256', $data['ticket']));
        $destination = is_array($payload) ? StreamDestination::query()->find($payload['destination_id']) : null;
        abort_unless($destination !== null, 404, 'This streaming ticket is invalid or has expired.');

        return response()->json(['data' => [
            'platform' => $destination->platform,
            'server_url' => $destination->server_url,
            'stream_key' => $destination->stream_key,
            'orientation' => $payload['orientation'],
            'resolution' => $payload['resolution'],
        ]]);
    }

    private function relaySecret(): string
    {
        return (string) config('livesell.relay_secret');
    }
}
