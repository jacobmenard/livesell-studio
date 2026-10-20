<?php

namespace App\Notifications;

use App\Models\Plan;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** Reminds the account owner their paid month ends soon, so they can renew in time. */
class PlanEndingSoon extends Notification
{
    use Queueable;

    public function __construct(public readonly Plan $plan, public readonly Carbon $endsAt) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $date = $this->endsAt->copy()->timezone(config('app.timezone'))->format('M j, Y');
        $amount = $this->plan->currency.' '.number_format($this->plan->price_monthly);

        return PaymentMail::replyToSupport((new MailMessage)
            ->subject("Your {$this->plan->name} plan ends on {$date}")
            ->line("Your {$this->plan->name} plan is paid until {$date}.")
            ->line("Renew now ({$amount} for the next month) to keep going live without a break. The new month starts right after this one.")
            ->action('Renew my plan', rtrim((string) config('livesell.frontend_url'), '/').'/plans')
            ->line('Already sent your payment? You can ignore this email; we’ll confirm it soon.'));
    }
}
