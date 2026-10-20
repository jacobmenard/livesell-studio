<?php

namespace App\Notifications;

use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the account owner their payment arrived and is being checked (the plan starts once approved). */
class PaymentReceived extends Notification
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
            ->subject("We received your payment for {$payment->plan->name}")
            ->line("Thanks! We received your payment details for the {$payment->plan->name} plan.")
            ->line("Amount: {$amount}");
        if ($payment->method_label) {
            $message->line("Paid to: {$payment->method_label}");
        }

        return PaymentMail::replyToSupport($message
            ->line("Reference number: {$payment->reference_number}")
            ->line('We’ll check it and email you again once it’s approved. Your plan switches on as soon as it is.')
            ->action('View your plan', rtrim((string) config('livesell.frontend_url'), '/').'/plans'));
    }
}
