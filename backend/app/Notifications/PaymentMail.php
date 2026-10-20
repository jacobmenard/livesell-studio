<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/** What payment emails to sellers share. */
final class PaymentMail
{
    /**
     * They come from the no-reply sender (MAIL_FROM_ADDRESS), so a reply goes to the business
     * inbox instead, when one is set.
     */
    public static function replyToSupport(MailMessage $message): MailMessage
    {
        $inbox = trim((string) config('livesell.payments_email'));

        return $inbox !== '' ? $message->replyTo($inbox) : $message;
    }
}
