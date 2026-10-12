<?php

namespace Database\Seeders;

use App\Models\Setup;
use App\Services\SetupDefaults;
use App\Services\SetupWriter;
use App\Support\Catalog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * The six starter templates from the product guide. Safe to run again: templates are
 * matched by name and refreshed in place.
 */
class TemplateSeeder extends Seeder
{
    public function run(SetupWriter $writer): void
    {
        foreach ($this->templates() as $template) {
            DB::transaction(function () use ($template, $writer): void {
                $setup = Setup::query()
                    ->where('is_template', true)
                    ->where('name', $template['name'])
                    ->first() ?? new Setup;

                $background = array_merge(SetupDefaults::background(), ['preset' => $template['background']]);
                if ($template['background'] === 'white') {
                    $background['mode'] = 'image';
                }

                // Popups that start on screen, with any linked sounds and custom text popups.
                $popups = SetupDefaults::presetPopups();
                foreach ($template['popups'] as $override) {
                    $found = false;
                    foreach ($popups as $i => $row) {
                        if ($row['key'] === $override['key']) {
                            $popups[$i] = array_merge($row, $override);
                            $found = true;
                        }
                    }
                    if (! $found) {
                        $popups[] = array_merge([
                            'kind' => 'text', 'preset_key' => null, 'media_id' => null, 'size' => Catalog::POPUP_SIZE_DEFAULT,
                            'entrance' => 'pop', 'effect' => 'none', 'effect_repeat' => 'once', 'auto_hide' => 0, 'sound' => null,
                        ], $override);
                    }
                }

                $onScreen = [];
                foreach ($template['on_screen'] as $i => $key) {
                    foreach ($popups as $row) {
                        if ($row['key'] === $key) {
                            $scenePopup = SetupWriter::normalizePopup($row);
                            unset($scenePopup['auto_hide'], $scenePopup['sound']);
                            $onScreen[] = $scenePopup + ['shown_at' => $i];
                        }
                    }
                }

                $setup->fill([
                    'name' => $template['name'],
                    'description' => $template['description'],
                    'orientation' => $template['orientation'],
                    'resolution' => '1080p',
                    'camera' => SetupDefaults::camera(),
                    'background' => $background,
                    'sound_settings' => SetupDefaults::soundSettings(),
                    'output_settings' => SetupDefaults::outputSettings(),
                    'scene' => SetupDefaults::scene($template['orientation'], null, $background, false, $onScreen),
                ]);
                $setup->is_template = true;
                $setup->user_id = null;
                $setup->save();

                $writer->syncPopups($setup, $popups);
            });
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function templates(): array
    {
        return [
            [
                'name' => '11.11 Mega sale',
                'description' => 'Fireworks and ka-ching ready to go',
                'orientation' => 'landscape',
                'background' => 'brand',
                'popups' => [
                    ['key' => 'sale1111', 'label' => '11.11 SALE', 'text' => '11.11 SALE', 'color' => 'coral', 'position' => 'tc', 'effect' => 'fireworks', 'effect_repeat' => 'once', 'sound' => 'fireworks'],
                    ['key' => 'off10', 'position' => 'br', 'sound' => 'kaching'],
                ],
                'on_screen' => ['sale1111', 'off10'],
            ],
            [
                'name' => 'Beauty demo',
                'description' => 'Soft sparkles, close-up friendly',
                'orientation' => 'portrait',
                'background' => 'vanity',
                'popups' => [
                    ['key' => 'new', 'position' => 'tl', 'effect' => 'sparkle'],
                    ['key' => 'ship', 'position' => 'bc', 'effect' => 'sparkle', 'sound' => 'ding'],
                ],
                'on_screen' => ['new', 'ship'],
            ],
            [
                'name' => 'Cooking live',
                'description' => 'Ding and applause for each dish',
                'orientation' => 'landscape',
                'background' => 'kitchen',
                'popups' => [
                    ['key' => 'live', 'position' => 'tl', 'sound' => 'ding'],
                    ['key' => 'b1t1', 'sound' => 'applause'],
                ],
                'on_screen' => ['live'],
            ],
            [
                'name' => 'Auction night',
                'description' => 'Drumroll, bang and SOLD OUT',
                'orientation' => 'landscape',
                'background' => 'loft',
                'popups' => [
                    ['key' => 'sold', 'position' => 'mc', 'entrance' => 'bounce', 'sound' => 'bang'],
                    ['key' => 'last', 'sound' => 'drumroll'],
                ],
                'on_screen' => ['sold'],
            ],
            [
                'name' => 'Payday sale',
                'description' => 'Buy 1 take 1 with confetti',
                'orientation' => 'portrait',
                'background' => 'rack',
                'popups' => [
                    ['key' => 'b1t1', 'position' => 'tc', 'effect' => 'confetti', 'sound' => 'kaching'],
                    ['key' => 'free', 'position' => 'br'],
                ],
                'on_screen' => ['b1t1', 'free'],
            ],
            [
                'name' => 'Clean and simple',
                'description' => 'No popups, just you',
                'orientation' => 'landscape',
                'background' => 'white',
                'popups' => [],
                'on_screen' => [],
            ],
        ];
    }
}
