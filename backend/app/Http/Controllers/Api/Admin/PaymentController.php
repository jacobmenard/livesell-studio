<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use App\Services\Payments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Superadmin: payments to check against the bank account, and where sellers send money.
 * Approving a payment puts its plan in force; rejecting it tells the seller why.
 */
class PaymentController extends Controller
{
    public function __construct(private readonly Payments $payments) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:pending,approved,rejected,all'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $status = $data['status'] ?? Payment::PENDING;
        $search = trim((string) ($data['search'] ?? ''));
        $reference = Payments::normalizeReference($search);

        $payments = Payment::query()
            ->with(['plan', 'account', 'submitter', 'reviewer'])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('reference_number', 'like', "%{$reference}%")
                ->orWhereHas('account', fn ($a) => $a->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            // Oldest first while waiting (first come, first served), newest first otherwise.
            ->orderBy('id', $status === Payment::PENDING ? 'asc' : 'desc')
            ->paginate(20);

        return response()->json([
            'data' => PaymentResource::collection($payments->getCollection()),
            'meta' => ['current_page' => $payments->currentPage(), 'last_page' => $payments->lastPage(), 'total' => $payments->total()],
        ]);
    }

    public function pendingCount(): JsonResponse
    {
        return response()->json(['data' => ['pending' => Payment::query()->pending()->count()]]);
    }

    public function approve(Request $request, Payment $payment): PaymentResource
    {
        $payment = $this->payments->approve($payment, $request->user());

        return new PaymentResource($payment->load(['plan', 'account', 'submitter', 'reviewer']));
    }

    public function reject(Request $request, Payment $payment): PaymentResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $payment = $this->payments->reject($payment, $request->user(), $data['reason']);

        return new PaymentResource($payment->load(['plan', 'account', 'submitter', 'reviewer']));
    }

    public function settings(): JsonResponse
    {
        return response()->json(['data' => $this->payments->settings()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bank_name' => ['required', 'string', 'max:60'],
            'account_number' => ['required', 'string', 'max:34', 'regex:/^[0-9][0-9 \-]*$/'],
            'account_name' => ['required', 'string', 'max:80'],
            'instructions' => ['nullable', 'string', 'max:1000'],
        ], ['account_number.regex' => 'Use numbers only (spaces and dashes are fine).']);

        $this->payments->saveSettings($data);

        return response()->json(['data' => $this->payments->settings()]);
    }
}
