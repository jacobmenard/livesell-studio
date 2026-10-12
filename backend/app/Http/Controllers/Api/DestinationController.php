<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpsertDestinationRequest;
use App\Http\Resources\DestinationResource;
use App\Models\StreamDestination;
use App\Support\Catalog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Saved RTMP destinations (Facebook, YouTube, TikTok, other). Keys are encrypted at
 * rest and only a hint is ever returned. Streaming to them goes through BroadcastController.
 */
class DestinationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return DestinationResource::collection(
            $request->user()->accountOwner()->streamDestinations()->orderBy('platform')->get()
        );
    }

    public function update(UpsertDestinationRequest $request, string $platform): DestinationResource
    {
        abort_unless(in_array($platform, Catalog::PLATFORMS, true), 404);

        /** @var StreamDestination $destination */
        $destination = $request->user()->streamDestinations()->updateOrCreate(
            ['platform' => $platform],
            $request->only(['server_url', 'stream_key']),
        );

        return new DestinationResource($destination);
    }

    public function destroy(Request $request, string $platform): Response
    {
        abort_unless(in_array($platform, Catalog::PLATFORMS, true), 404);
        $request->user()->streamDestinations()->where('platform', $platform)->delete();

        return response()->noContent();
    }
}
