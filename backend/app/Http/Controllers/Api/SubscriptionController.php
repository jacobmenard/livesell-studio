<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\PlanResource;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\Payments;
use App\Services\Subscriptions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The account's plan: what it has, what is in use, where to send a payment, the next
 * month's payment (renewal), and the payments sent so far (owner only).
 */
class SubscriptionController extends Controller
{
    public function __construct(
        private readonly Subscriptions $subscriptions,
        private readonly Payments $payments,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => $this->summary($user->accountOwner(), ! $user->isSubUser())]);
    }

    /** @return array<string, mixed> */
    private function summary(User $account, bool $isOwner): array
    {
        $subscription = $account->subscription()->first();
        $current = $subscription?->isCurrent() ? $subscription : null;
        $plan = $this->subscriptions->planFor($account);
        $pending = $this->payments->pendingFor($account);

        // A paid month that ends: the next one can be paid ahead (one month at most).
        $nextPayment = null;
        if ($current && $current->ends_at && $plan->purchasable) {
            $nextPayment = [
                'plan' => new PlanResource($plan),
                'amount' => $plan->price_monthly,
                'currency' => $plan->currency,
                'due_at' => $current->ends_at->toIso8601String(),
                'renewable_from' => $this->payments->renewableFrom($account, $plan)?->toIso8601String(),
            ];
        }

        return [
            'plan' => new PlanResource($plan),
            'ends_at' => $current?->ends_at?->toIso8601String(),
            'usage' => $this->subscriptions->usage($account),
            'plans' => PlanResource::collection(Plan::query()->ordered()->get()),
            'payment_details' => $this->payments->acceptingPayments() ? $this->payments->settings() : null,
            'pending_payment' => $pending ? new PaymentResource($pending) : null,
            'next_payment' => $nextPayment,
            'payments' => $isOwner
                ? PaymentResource::collection(Payment::query()
                    ->where('user_id', $account->id)
                    ->with('plan')
                    ->latest('id')
                    ->limit(12)
                    ->get())
                : [],
        ];
    }
}
