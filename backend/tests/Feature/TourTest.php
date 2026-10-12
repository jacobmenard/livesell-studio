<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TourTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_seller_has_seen_no_walkthrough_yet(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.completed_tours', []);
    }

    public function test_finishing_a_walkthrough_is_remembered_once(): void
    {
        $me = User::factory()->create();
        $this->actingAs($me);

        $this->putJson('/api/me/tours/dashboard')->assertOk()->assertJsonPath('data.completed_tours', ['dashboard']);
        $this->putJson('/api/me/tours/dashboard')->assertOk()->assertJsonPath('data.completed_tours', ['dashboard']);
        $this->putJson('/api/me/tours/editor')->assertOk()->assertJsonPath('data.completed_tours', ['dashboard', 'editor']);

        $this->getJson('/api/auth/me')->assertJsonPath('data.completed_tours', ['dashboard', 'editor']);
        $this->assertSame(['dashboard', 'editor'], $me->fresh()->completed_tours);
    }

    public function test_unknown_walkthroughs_and_guests_are_refused(): void
    {
        $this->putJson('/api/me/tours/dashboard')->assertUnauthorized();

        $this->actingAs(User::factory()->create())->putJson('/api/me/tours/anything')->assertNotFound();
    }
}
