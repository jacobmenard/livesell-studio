<?php

namespace App\Notifications;

use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Tells the seller their payment was approved (plan active) or rejected (with the reason). */
class PaymentReviewed extends Notification
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
        $plan = $payment->plan->name;
        $url = rtrim((string) config('livesell.frontend_url'), '/').'/plans';

        if ($payment->status === Payment::APPROVED) {
            return (new MailMessage)
                ->subject("Payment approved: your {$plan} plan is active")
                ->line("Thanks! We received your payment (reference {$payment->reference_number}).")
                ->line("Your {$plan} plan runs until {$payment->period_end?->format('M j, Y')}.")
                ->action('View your plan', $url);
        }

        return (new MailMessage)
            ->subject('We couldn’t confirm your payment')
            ->line("We couldn’t confirm your payment for the {$plan} plan (reference {$payment->reference_number}).")
            ->line('Reason: '.($payment->review_note ?: 'Not given.'))
            ->line('You can send the payment details again from your plan page.')
            ->action('Go to your plan', $url);
    }
}
