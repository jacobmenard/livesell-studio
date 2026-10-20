<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Http\Resources\UserResource;
use App\Models\Plan;
use App\Models\User;
use App\Services\Impersonation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Superadmin: the seller account owners (read only: plans change through approved payments),
 * and signing in as one of them to see what they see.
 */
class AccountController extends Controller
{
    public function __construct(private readonly Impersonation $impersonation) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $search = addcslashes(trim((string) ($data['search'] ?? '')), '%_\\');

        $accounts = User::query()
            ->whereNull('owner_id')
            ->where('role', UserRole::Seller)
            ->with('subscription.plan')
            ->withCount(['subUsers as members_count'])
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->orderByDesc('id')
            ->paginate(25);

        $default = Plan::default();
        $trialPlan = Plan::trial();

        return response()->json([
            'data' => $accounts->getCollection()->map(fn (User $u) => $this->row($u, $default, $trialPlan))->values(),
            'meta' => ['current_page' => $accounts->currentPage(), 'last_page' => $accounts->lastPage(), 'total' => $accounts->total()],
        ]);
    }

    /** Signs the superadmin in as this owner; POST /api/auth/impersonation/stop comes back. */
    public function impersonate(Request $request, User $account): UserResource
    {
        $this->impersonation->start($request, $request->user(), $account);

        return new UserResource($account);
    }

    /** @return array<string, mixed> */
    private function row(User $account, Plan $default, Plan $trialPlan): array
    {
        $subscription = $account->subscription;
        $current = $subscription && $subscription->isCurrent();
        $trial = ! $current && $account->onTrial();

        return [
            'id' => $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'plan' => new PlanResource($current ? $subscription->plan : ($trial ? $trialPlan : $default)),
            'ends_at' => $current ? $subscription->ends_at?->toIso8601String() : null,
            'trial_ends_at' => $trial ? $account->trial_ends_at?->toIso8601String() : null,
            'members' => (int) $account->members_count,
            'joined_at' => $account->created_at?->toIso8601String(),
        ];
    }
}
