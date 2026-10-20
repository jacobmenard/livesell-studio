<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentMethodResource;
use App\Models\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Superadmin: the GCash, Maya and bank accounts sellers can pay into. Turning one off hides
 * it from sellers; deleting it keeps the payments made to it (they hold a copy of its details).
 */
class PaymentMethodController extends Controller
{
    private const MAX_METHODS = 20;

    public function index(): AnonymousResourceCollection
    {
        return PaymentMethodResource::collection(PaymentMethod::query()->ordered()->get());
    }

    public function store(Request $request): JsonResponse
    {
        if (PaymentMethod::query()->count() >= self::MAX_METHODS) {
            throw ValidationException::withMessages(['type' => 'You can have up to '.self::MAX_METHODS.' payment methods. Remove one first.']);
        }
        $method = PaymentMethod::query()->create($this->validated($request));

        return (new PaymentMethodResource($method))->response()->setStatusCode(201);
    }

    public function update(Request $request, PaymentMethod $paymentMethod): PaymentMethodResource
    {
        $paymentMethod->update($this->validated($request));

        return new PaymentMethodResource($paymentMethod);
    }

    public function destroy(PaymentMethod $paymentMethod): Response
    {
        $paymentMethod->delete();

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(PaymentMethod::TYPES)],
            'label' => ['nullable', 'required_if:type,bank', 'string', 'max:60', 'not_regex:/[\x00-\x1F\x7F]/u'],
            'account_name' => ['required', 'string', 'max:80', 'not_regex:/[\x00-\x1F\x7F]/u'],
            // Bank account or mobile numbers: digits, with spaces, dashes or a leading +.
            'account_number' => ['required', 'string', 'max:34', 'regex:/^\+?[0-9][0-9 \-]*$/'],
            'instructions' => ['nullable', 'string', 'max:500'],
            'enabled' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'between:0,1000'],
        ], [
            'label.required_if' => 'Enter the bank’s name.',
            'account_number.regex' => 'Use numbers only (spaces and dashes are fine).',
        ]);

        // "enabled" and "sort_order" only change when sent (a new method starts enabled, first).
        return [
            'type' => $data['type'],
            'label' => isset($data['label']) && trim($data['label']) !== '' ? trim($data['label']) : null,
            'account_name' => trim($data['account_name']),
            'account_number' => trim($data['account_number']),
            'instructions' => isset($data['instructions']) && trim($data['instructions']) !== '' ? trim($data['instructions']) : null,
        ] + array_intersect_key($data, array_flip(['enabled', 'sort_order']));
    }
}
