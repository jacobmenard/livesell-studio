<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OutputLink;
use App\Services\SceneResolver;
use Illuminate\Broadcasting\Broadcasters\PusherBroadcaster;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Broadcast;

/**
 * Read-only endpoints for the clean screen opened from a private link (no login:
 * OBS and TikTok LIVE Studio load it as a Browser Source).
 */
class OutputController extends Controller
{
    public function __construct(private readonly SceneResolver $resolver) {}

    public function show(string $token): JsonResponse
    {
        $link = $this->findLink($token);

        // Note when the link was last used (at most once a minute, to spare the database).
        if ($link->last_seen_at === null || $link->last_seen_at->lt(now()->subMinute())) {
            $link->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        return response()->json([
            'data' => [
                'channel' => $link->channelName(),
                'scene' => $this->resolver->resolve($link->setup),
            ],
        ]);
    }

    /**
     * Signs the clean screen into its private WebSocket channel. The link token is the
     * credential, so this only ever authorizes that link's own channel.
     */
    public function authorizeChannel(Request $request, string $token): Response
    {
        $link = $this->findLink($token);
        $data = $request->validate([
            'socket_id' => ['required', 'string', 'max:64', 'regex:/^\d+\.\d+$/'],
            'channel_name' => ['required', 'string', 'max:120'],
        ]);

        if ($data['channel_name'] !== 'private-'.$link->channelName()) {
            abort(403, 'This link cannot open that channel.');
        }

        $broadcaster = Broadcast::connection();
        if (! $broadcaster instanceof PusherBroadcaster) {
            abort(503, 'Live updates are not set up on this server.');
        }

        $auth = $broadcaster->getPusher()->authorizeChannel($data['channel_name'], $data['socket_id']);

        return response($auth, 200, ['Content-Type' => 'application/json']);
    }

    private function findLink(string $token): OutputLink
    {
        $link = OutputLink::findActiveByToken($token);
        abort_if($link === null, 404, 'This link has been turned off. Make a new one in NegosyoWork Studio.');

        return $link;
    }
}
