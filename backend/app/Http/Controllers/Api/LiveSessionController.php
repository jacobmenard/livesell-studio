<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LiveSession;
use App\Models\OutputLink;
use App\Models\Setup;
use App\Services\LiveSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Clean screens report that they're open (start), still open (heartbeat) and closed (end),
 * so the plan's limit on setups live at once can be enforced. Two ways in: the seller's own
 * window (signed in) and the private Browser Source link (its token, no login).
 */
class LiveSessionController extends Controller
{
    public function __construct(private readonly LiveSessions $sessions) {}

    public function store(Request $request, Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);

        // "screen": the website's own clean-screen window (a free account gets a preview).
        // "app": the Android app streaming straight to a platform (no preview: it is a real live).
        $source = $request->validate(['source' => ['sometimes', 'string', 'in:screen,app']])['source'] ?? 'screen';

        return $this->respond($this->sessions->start($setup, $request->user(), $source), 201);
    }

    public function update(Request $request, LiveSession $session): JsonResponse
    {
        abort_unless($session->account_id === $request->user()->accountId(), 404);

        return $this->respond($this->sessions->beat($session));
    }

    public function destroy(Request $request, LiveSession $session): Response
    {
        abort_unless($session->account_id === $request->user()->accountId(), 404);
        $this->sessions->end($session);

        return response()->noContent();
    }

    public function storeForLink(string $token): JsonResponse
    {
        return $this->respond($this->sessions->start($this->link($token)->setup, null, 'link'), 201);
    }

    public function updateForLink(string $token, LiveSession $session): JsonResponse
    {
        abort_unless($session->setup_id === $this->link($token)->setup_id, 404);

        return $this->respond($this->sessions->beat($session));
    }

    public function destroyForLink(string $token, LiveSession $session): Response
    {
        abort_unless($session->setup_id === $this->link($token)->setup_id, 404);
        $this->sessions->end($session);

        return response()->noContent();
    }

    private function link(string $token): OutputLink
    {
        $link = OutputLink::findActiveByToken($token);
        abort_if($link === null, 404, 'This link has been turned off. Make a new one in NegosyoWork Studio.');

        return $link;
    }

    private function respond(LiveSession $session, int $status = 200): JsonResponse
    {
        return response()->json(['data' => ['id' => $session->id, 'heartbeat_seconds' => LiveSessions::HEARTBEAT_SECONDS]], $status);
    }
}
