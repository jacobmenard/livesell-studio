<?php

use Illuminate\Support\Facades\Schedule;

// Clear out password-reset tokens that have expired.
Schedule::command('auth:clear-resets')->daily();

// A plan that ran out (not changed) pauses sub-users beyond its seats within the hour.
// Plans themselves need no job: every request checks their end date.
Schedule::command('plans:fit-seats')->hourly()->withoutOverlapping();

// "Your plan / free trial ends soon" emails, once each, only at a decent hour.
Schedule::command('plans:send-reminders')->hourly()->between('8:00', '20:00')->withoutOverlapping();
