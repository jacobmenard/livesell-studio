<?php

namespace App\Services;

use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * The plan doesn't allow this setup to go live right now. On the Free plan the seller's own
 * clean-screen window may still be shown as a watermarked preview ($preview).
 */
class LiveLimitReached extends ConflictHttpException
{
    public function __construct(string $message, public readonly bool $preview = false)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'preview' => $this->preview], 409);
    }
}
