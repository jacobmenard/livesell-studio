<?php

namespace App\Notifications;

use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the superadmin (and the business inbox) a seller sent a payment to check. */
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

        $message = (new MailMessage)
            ->subject("Payment to check: {$amount} for {$payment->plan->name}")
            ->line("{$payment->account->name} ({$payment->account->email}) paid for the {$payment->plan->name} plan.")
            ->line("Amount: {$amount}");
        if ($payment->method_label) {
            $message->line("Paid to: {$payment->method_label}");
        }

        return $message
            ->line("Reference number: {$payment->reference_number}")
            ->line('Check that the money reached that account before approving it.')
            ->action('Review payments', rtrim((string) config('livesell.frontend_url'), '/').'/admin/payments');
    }
}
