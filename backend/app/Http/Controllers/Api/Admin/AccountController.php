<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\PlanResource;
use App\Http\Resources\UserResource;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\Impersonation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Superadmin: the seller account owners (plans change through approved payments, not here),
 * signing in as one of them to see what they see, and deactivating an account.
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

    /** One account: its plan, team, setups, platforms and latest payments. */
    public function show(User $account): JsonResponse
    {
        $this->ensureSellerAccount($account);
        $this->loadRow($account)->loadCount('setups');

        $team = $account->subUsers()->orderBy('created_at')->orderBy('id')->get();
        $payments = Payment::query()
            ->where('user_id', $account->id)
            ->with(['plan', 'submitter', 'reviewer'])
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        return response()->json(['data' => $this->row($account, Plan::default(), Plan::trial()) + [
            'setups' => (int) $account->setups_count,
            'platforms' => $account->streamDestinations()->orderBy('platform')->pluck('platform')->values(),
            'team' => $team->map(fn (User $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'email' => $m->email,
                'active' => ! $m->isDeactivated(),
                'added_at' => $m->created_at?->toIso8601String(),
            ])->values(),
            'payments' => PaymentResource::collection($payments),
        ]]);
    }

    /** Signs the superadmin in as this owner; POST /api/auth/impersonation/stop comes back. */
    public function impersonate(Request $request, User $account): UserResource
    {
        $this->impersonation->start($request, $request->user(), $account);

        return new UserResource($account);
    }

    /**
     * Nobody in the account can sign in until it's reactivated: its phones are signed out now,
     * its browsers on their next request (EnsureAccountIsActive), and its clean-screen links
     * stop. Nothing is deleted.
     */
    public function deactivate(Request $request, User $account): JsonResponse
    {
        $this->ensureSellerAccount($account);

        if (! $account->isDisabled()) {
            DB::transaction(function () use ($account): void {
                $account->forceFill(['disabled_at' => now()])->save();
                PersonalAccessToken::query()
                    ->where('tokenable_type', $account->getMorphClass())
                    ->whereIn('tokenable_id', $account->subUsers()->pluck('id')->push($account->id))
                    ->delete();
            });
            Log::notice('[admin] account deactivated', $this->context($request, $account));
        }

        return $this->rowResponse($account);
    }

    public function reactivate(Request $request, User $account): JsonResponse
    {
        $this->ensureSellerAccount($account);

        if ($account->isDisabled()) {
            $account->forceFill(['disabled_at' => null])->save();
            Log::notice('[admin] account reactivated', $this->context($request, $account));
        }

        return $this->rowResponse($account);
    }

    /** Only seller account owners are managed here (not sub-users, not the superadmin). */
    private function ensureSellerAccount(User $account): void
    {
        abort_if($account->isSubUser() || $account->role !== UserRole::Seller, 404);
    }

    private function loadRow(User $account): User
    {
        return $account->load('subscription.plan')->loadCount(['subUsers as members_count']);
    }

    private function rowResponse(User $account): JsonResponse
    {
        return response()->json(['data' => $this->row($this->loadRow($account), Plan::default(), Plan::trial())]);
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
            'disabled_at' => $account->disabled_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function context(Request $request, User $account): array
    {
        return [
            'admin_id' => $request->user()->id,
            'admin_email' => $request->user()->email,
            'account_id' => $account->id,
            'account_email' => $account->email,
            'ip' => $request->ip(),
        ];
    }
}
