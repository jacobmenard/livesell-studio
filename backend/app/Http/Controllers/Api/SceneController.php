<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateSceneRequest;
use App\Models\Media;
use App\Models\Setup;
use App\Services\LiveRelay;
use App\Services\PopupRules;
use App\Services\SceneResolver;
use App\Services\SetupDefaults;
use App\Services\SetupWriter;
use App\Support\Catalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * The live part of the editor: what is on screen and which sound just played.
 */
class SceneController extends Controller
{
    public function __construct(
        private readonly SceneResolver $resolver,
        private readonly LiveRelay $relay,
    ) {}

    /** Current picture for the seller's own clean-screen window. */
    public function show(Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);

        return response()->json(['data' => $this->resolver->resolve($setup)]);
    }

    public function update(UpdateSceneRequest $request, Setup $setup): JsonResponse
    {
        $data = $request->validated();

        $popups = array_map(function (array $popup): array {
            $row = SetupWriter::normalizePopup($popup + ['auto_hide' => 0]);
            unset($row['auto_hide'], $row['sound']);

            return $row + ['shown_at' => (int) $popup['shown_at']];
        }, $data['popups']);

        $scene = [
            'orientation' => $data['orientation'],
            'see_through' => (bool) $data['see_through'],
            'camera' => $data['camera'],
            'background' => $data['background'],
            'foreground' => SetupWriter::onlyKeys($data['foreground'] ?? [], SetupDefaults::foreground()),
            'popups' => $popups,
        ];

        // The live picture is not an "edit", so it doesn't change "last edited".
        $setup->timestamps = false;
        $setup->forceFill(['scene' => $scene, 'scene_updated_at' => now()])->save();
        $setup->timestamps = true;

        $delivered = $this->relay->publishScene($setup);

        return response()->json([
            'data' => $this->resolver->resolve($setup),
            'meta' => ['delivered' => $delivered],
        ]);
    }

    /** Plays a sound on the live (only sent when "Send to live" is on). */
    public function sound(Request $request, Setup $setup): JsonResponse
    {
        Gate::authorize('goLive', $setup);
        $data = $request->validate([
            'sound' => ['required', 'string', 'max:32', PopupRules::soundRule()],
            'volume' => ['required', 'integer', 'between:0,100'],
        ]);

        $url = null;
        $mediaId = Catalog::mediaIdFromSound($data['sound']);
        if ($mediaId !== null) {
            $media = Media::query()->ownedBy($setup->user_id, 'sound')->whereKey($mediaId)->first();
            if (! $media) {
                throw ValidationException::withMessages(['sound' => 'That sound is not in your uploads.']);
            }
            $url = $media->url;
        }

        $delivered = $this->relay->publishSound($setup, $data['sound'], $url, (int) $data['volume']);

        return response()->json(['meta' => ['delivered' => $delivered]]);
    }
}
