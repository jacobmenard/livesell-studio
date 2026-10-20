<?php

return [

    /*
    | Where the React app lives. Used for clean-screen links and password-reset emails.
    */
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    /*
    | Disk for uploaded popup images, backgrounds and sounds. Use "public" locally;
    | in production point it at S3-style storage served from a separate domain.
    */
    'media_disk' => env('MEDIA_DISK', 'public'),

    'max_media_per_user' => (int) env('LIVESELL_MAX_MEDIA_PER_USER', 200),

    'max_setups_per_user' => (int) env('LIVESELL_MAX_SETUPS_PER_USER', 100),

    /*
    | The plan (by code) accounts have without a subscription, or after it ends: the free
    | trial, which sets everything up but can't go live.
    */
    'default_plan' => env('LIVESELL_DEFAULT_PLAN', 'trial'),

    /*
    | New sign-ups get a free trial: this many days with this plan's limits (so they can go
    | live), then the default plan until a payment is approved. 0 turns the trial off.
    */
    'trial_days' => (int) env('LIVESELL_TRIAL_DAYS', 7),

    'trial_plan' => env('LIVESELL_TRIAL_PLAN', 'solo'),

    /*
    | "Ending soon" emails (plans:send-reminders): this many days before a paid plan or the
    | free trial ends. Each is sent once, between 8 am and 8 pm (APP_TIMEZONE).
    */
    'plan_reminder_days' => (int) env('LIVESELL_PLAN_REMINDER_DAYS', 3),

    'trial_reminder_days' => (int) env('LIVESELL_TRIAL_REMINDER_DAYS', 2),

    /*
    | Streaming straight to Facebook / YouTube goes through the local relay (relay/),
    | which swaps a one-time ticket for the saved server and key. The relay must use the
    | same secret; leave it empty to turn direct streaming off.
    */
    'relay_secret' => env('RELAY_SECRET'),

    'broadcast_ticket_ttl' => (int) env('LIVESELL_BROADCAST_TICKET_TTL', 60),

    /*
    | The business inbox (e.g. support@yourdomain): it gets an email for every payment to
    | check, and sellers' replies to payment emails go there (they are sent from the
    | MAIL_FROM_ADDRESS, e.g. a no-reply address). Empty: superadmin accounts only.
    */
    'payments_email' => env('LIVESELL_PAYMENTS_EMAIL'),

    /*
    | More addresses that get the "payment to check" email, comma separated (e.g. the owner's
    | personal email). Invalid ones are skipped and nobody gets it twice.
    */
    'payment_alert_emails' => array_values(array_filter(array_map('trim', explode(',', (string) env('LIVESELL_PAYMENT_ALERT_EMAILS', ''))))),

    /*
    | The superadmin account made by SuperAdminSeeder. Leave the password empty locally
    | to have one generated and printed; production refuses to seed without one.
    */
    'superadmin' => [
        'name' => env('SUPERADMIN_NAME', 'Super Admin'),
        'email' => env('SUPERADMIN_EMAIL', 'superadmin@livesell.test'),
        'password' => env('SUPERADMIN_PASSWORD'),
    ],

];
