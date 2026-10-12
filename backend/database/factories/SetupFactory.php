<?php

namespace Database\Factories;

use App\Models\Setup;
use App\Models\User;
use App\Services\SetupDefaults;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Bare setup rows for tests. Use SetupWriter::createBlank() when the built-in popups matter.
 *
 * @extends Factory<Setup>
 */
class SetupFactory extends Factory
{
    protected $model = Setup::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'is_template' => false,
            'name' => fake()->words(3, true),
            'orientation' => 'landscape',
            'resolution' => '1080p',
            'camera' => SetupDefaults::camera(),
            'background' => SetupDefaults::background(),
            'sound_settings' => SetupDefaults::soundSettings(),
            'output_settings' => SetupDefaults::outputSettings(),
            'scene' => SetupDefaults::scene(),
        ];
    }

    public function template(): static
    {
        return $this->state(fn () => ['user_id' => null, 'is_template' => true]);
    }
}
