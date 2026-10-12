<?php

use Illuminate\Support\Facades\Schedule;

// Clear out password-reset tokens that have expired.
Schedule::command('auth:clear-resets')->daily();
