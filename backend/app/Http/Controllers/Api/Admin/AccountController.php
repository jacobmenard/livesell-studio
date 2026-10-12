<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Models\User;
use App\Services\Subscriptions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Superadmin: account owners and their plans. Setting a plan by hand (a comp, a fix) puts
 * it in force straight away and fits the team to it; paid plans come from Payments.
 */
class AccountController extends Controller
{
    public function __construct(private readonly Subscriptions $subscriptions) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $search = trim((string) ($data['search'] ?? ''));

        $accounts = User::query()
            ->whereNull('owner_id')
            ->with('subscription.plan')
            ->withCount(['subUsers as members_count'])
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->orderByDesc('id')
            ->paginate(25);

        $default = Plan::default();

        return response()->json([
            'data' => $accounts->getCollection()->map(fn (User $u) => $this->row($u, $default))->values(),
            'meta' => ['current_page' => $accounts->currentPage(), 'last_page' => $accounts->lastPage(), 'total' => $accounts->total()],
        ]);
    }

    public function updatePlan(Request $request, User $account): JsonResponse
    {
        abort_if($account->isSubUser(), 404);
        $data = $request->validate([
            'plan' => ['required', 'string', 'exists:plans,code'],
            'ends_at' => ['nullable', 'date', 'after:today'],
        ]);

        $plan = Plan::query()->where('code', $data['plan'])->firstOrFail();
        $endsAt = isset($data['ends_at']) ? Carbon::parse($data['ends_at'])->endOfDay() : null;
        $this->subscriptions->apply($account, $plan, $endsAt);

        $account->load('subscription.plan')->loadCount(['subUsers as members_count']);

        return response()->json(['data' => $this->row($account, Plan::default())]);
    }

    /** @return array<string, mixed> */
    private function row(User $account, Plan $default): array
    {
        $subscription = $account->subscription;
        $current = $subscription && $subscription->isCurrent();

        return [
            'id' => $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'role' => $account->role->value,
            'plan' => new PlanResource($current ? $subscription->plan : $default),
            'ends_at' => $current ? $subscription->ends_at?->toIso8601String() : null,
            'members' => (int) $account->members_count,
            'joined_at' => $account->created_at?->toIso8601String(),
        ];
    }
}
