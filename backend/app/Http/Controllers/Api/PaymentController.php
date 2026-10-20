<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Plan;
use App\Services\Payments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The account owner sends a payment for a plan; the receipt stays private. */
class PaymentController extends Controller
{
    public function __construct(private readonly Payments $payments) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['required', 'string', 'exists:plans,code'],
            // Only a method the superadmin has turned on.
            'payment_method' => ['required', 'integer', 'exists:payment_methods,id,enabled,1'],
            'reference_number' => ['required', 'string', 'max:40'],
            'proof' => ['required', 'file', 'mimetypes:image/png,image/jpeg,image/webp', 'max:5120'],
        ], [
            'payment_method.required' => 'Choose how you paid.',
            'payment_method.exists' => 'That payment method isn’t available. Choose another.',
            'proof.required' => 'Attach a screenshot of your receipt.',
            'proof.mimetypes' => 'The receipt must be a PNG, JPG or WEBP screenshot.',
            'proof.max' => 'The receipt must be 5 MB or smaller.',
        ]);

        $payment = $this->payments->submit(
            $request->user()->accountOwner(),
            $request->user(),
            Plan::query()->where('code', $data['plan'])->firstOrFail(),
            PaymentMethod::query()->findOrFail($data['payment_method']),
            $data['reference_number'],
            $request->file('proof'),
        );

        return (new PaymentResource($payment->load('plan')))->response()->setStatusCode(201);
    }

    /** The receipt screenshot: for the account owner and the superadmin only. */
    public function proof(Request $request, Payment $payment): StreamedResponse
    {
        $user = $request->user();
        $allowed = $user->isSuperAdmin() || (! $user->isSubUser() && $payment->user_id === $user->id);
        abort_unless($allowed, 404);

        $disk = Storage::disk(Payment::PROOF_DISK);
        abort_unless($disk->exists($payment->proof_path), 404);

        $name = 'receipt-'.$payment->id.'.'.pathinfo($payment->proof_path, PATHINFO_EXTENSION);

        return $disk->response($payment->proof_path, $name, [
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
