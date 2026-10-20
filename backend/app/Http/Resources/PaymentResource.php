<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A payment for the seller's history or the superadmin's review list. The receipt is never
 * a public URL: it is fetched from GET /api/payments/{id}/proof with the session.
 *
 * @mixin Payment
 */
class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'plan' => new PlanResource($this->whenLoaded('plan')),
            'amount' => $this->amount,
            'currency' => $this->currency,
            'method' => $this->method,
            'method_label' => $this->method_label,
            'reference_number' => $this->reference_number,
            'status' => $this->status,
            'review_note' => $this->review_note,
            'submitted_at' => $this->created_at?->toIso8601String(),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'period_start' => $this->period_start?->toIso8601String(),
            'period_end' => $this->period_end?->toIso8601String(),
            // Only on the superadmin's list.
            'account' => $this->whenLoaded('account', fn () => [
                'id' => $this->account->id,
                'name' => $this->account->name,
                'email' => $this->account->email,
            ]),
            'submitted_by' => $this->whenLoaded('submitter', fn () => $this->submitter?->name),
            'reviewed_by' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->name),
        ];
    }
}
