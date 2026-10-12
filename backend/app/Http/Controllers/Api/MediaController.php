<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMediaRequest;
use App\Http\Resources\MediaResource;
use App\Models\Media;
use App\Services\MediaStorage;
use App\Support\Catalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class MediaController extends Controller
{
    public function __construct(private readonly MediaStorage $storage) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['kind' => ['sometimes', Rule::in(Catalog::MEDIA_KINDS)]]);

        $media = Media::query()
            ->ownedBy($request->user()->accountId(), $data['kind'] ?? null)
            ->orderBy('id')
            ->get();

        return MediaResource::collection($media);
    }

    public function store(StoreMediaRequest $request): JsonResponse
    {
        $media = $this->storage->store($request->user()->accountOwner(), $request->string('kind')->toString(), $request->file('file'));

        return (new MediaResource($media))->response()->setStatusCode(201);
    }

    /** Deletes the file and every popup that showed it. */
    public function destroy(Media $media): Response
    {
        Gate::authorize('delete', $media);

        $this->storage->delete($media);

        return response()->noContent();
    }
}
