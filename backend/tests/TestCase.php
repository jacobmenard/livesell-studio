<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Look like the SPA: JSON responses, and a Referer on Sanctum's stateful list so
        // requests get a cookie session (CSRF checks are skipped while unit testing).
        $this->withHeaders([
            'Accept' => 'application/json',
            'Referer' => 'http://localhost/',
        ]);
    }
}
