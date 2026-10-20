<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentMethodResource;
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
 * The account's plan: what it has (or the free trial and when it ends), what is in use, the
 * ways to pay, the next month's payment (renewal), and the payments sent so far (owner only).
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
            // Set during the free week: the plan above is the trial's, not a paid one.
            'trial_ends_at' => ! $current && $account->onTrial() ? $account->trial_ends_at?->toIso8601String() : null,
            'usage' => $this->subscriptions->usage($account),
            'plans' => PlanResource::collection(Plan::query()->ordered()->get()),
            // Empty until the superadmin adds one: plans can't be paid for yet.
            'payment_methods' => PaymentMethodResource::collection($this->payments->methods()),
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
