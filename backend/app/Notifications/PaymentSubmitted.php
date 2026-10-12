<?php

namespace App\Notifications;

use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the superadmin a seller sent a payment to check. */
class PaymentSubmitted extends Notification
{
    use Queueable;

    public function __construct(public readonly Payment $payment) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $payment = $this->payment;
        $amount = $payment->currency.' '.number_format($payment->amount);

        return (new MailMessage)
            ->subject("Payment to check: {$amount} for {$payment->plan->name}")
            ->line("{$payment->account->name} ({$payment->account->email}) paid for the {$payment->plan->name} plan.")
            ->line("Amount: {$amount}")
            ->line("Reference number: {$payment->reference_number}")
            ->line('Check the receipt against your bank account before approving it.')
            ->action('Review payments', rtrim((string) config('livesell.frontend_url'), '/').'/admin/payments');
    }
}
