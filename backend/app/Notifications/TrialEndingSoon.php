<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** Reminds a new seller their free week ends soon, so they can choose a plan in time. */
class TrialEndingSoon extends Notification
{
    use Queueable;

    public function __construct(public readonly Carbon $endsAt) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $date = $this->endsAt->copy()->timezone(config('app.timezone'))->format('M j, Y g:i A');

        return PaymentMail::replyToSupport((new MailMessage)
            ->subject('Your free trial ends soon')
            ->line("Your free trial of NegosyoWork Studio ends on {$date}.")
            ->line('After that you can still set up your camera, popups and backgrounds, but going live needs a plan. Choose one and send your payment to keep going live.')
            ->action('Choose a plan', rtrim((string) config('livesell.frontend_url'), '/').'/plans'));
    }
}
