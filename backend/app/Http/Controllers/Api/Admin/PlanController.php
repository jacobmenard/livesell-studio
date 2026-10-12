<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Subscriptions;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/** Superadmin: plan names, prices and limits (no code change needed to adjust them). */
class PlanController extends Controller
{
    public function __construct(private readonly Subscriptions $subscriptions) {}

    public function index(): AnonymousResourceCollection
    {
        return PlanResource::collection(Plan::query()->ordered()->get());
    }

    public function update(Request $request, Plan $plan): PlanResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40', 'not_regex:/[\x00-\x1F\x7F]/u'],
            'price_monthly' => ['required', 'integer', 'between:0,1000000'],
            'max_subusers' => ['required', 'integer', 'between:0,50'],
            // 0 = can't go live (the free trial).
            'max_live_setups' => ['required', 'integer', 'between:0,50'],
        ]);

        DB::transaction(function () use ($plan, $data): void {
            $plan->update($data);

            // Fewer (or more) seats now: fit every team on this plan to it.
            $accountIds = Subscription::query()->where('plan_id', $plan->id)->pluck('user_id');
            if ($plan->code === config('livesell.default_plan')) {
                // Accounts without a subscription are on the default plan too.
                $accountIds = $accountIds->merge(User::query()->whereNull('owner_id')->whereDoesntHave('subscription')->pluck('id'));
            }
            User::query()->whereIn('id', $accountIds)->has('subUsers')->each(
                fn (User $account) => $this->subscriptions->fitSeats($account, Plan::forAccount($account)),
            );
        });

        return new PlanResource($plan);
    }
}
