<?php

namespace Tests\Unit;

use App\Services\MediaStorage;
use App\Services\SetupDefaults;
use App\Services\SetupWriter;
use App\Support\Catalog;
use PHPUnit\Framework\TestCase;

class SetupWriterTest extends TestCase
{
    public function test_preset_popups_take_their_label_from_the_catalog(): void
    {
        $row = SetupWriter::normalizePopup(array_merge(SetupDefaults::presetPopup('off10'), [
            'label' => 'HACKED', 'text' => 'ignored', 'color' => 'blue', 'media_id' => 5,
        ]));

        $this->assertSame('10% OFF', $row['label']);
        $this->assertNull($row['text']);
        $this->assertNull($row['color']);
        $this->assertNull($row['media_id']);
    }

    public function test_text_popups_are_trimmed_and_labelled_by_their_text(): void
    {
        $row = SetupWriter::normalizePopup([
            'key' => 'txt-1', 'kind' => 'text', 'text' => '  ₱99 ONLY ', 'color' => 'yellow',
            'position' => 'mc', 'size' => 100, 'entrance' => 'pop', 'effect' => 'none', 'effect_repeat' => 'once',
        ]);

        $this->assertSame('₱99 ONLY', $row['text']);
        $this->assertSame('₱99 ONLY', $row['label']);
        $this->assertSame(0, $row['auto_hide']);
        $this->assertNull($row['sound']);
    }

    public function test_only_known_settings_keys_are_kept(): void
    {
        $out = SetupWriter::onlyKeys(['volume' => 10, 'evil' => 'x'], SetupDefaults::soundSettings());

        $this->assertSame(['volume' => 10, 'to_stream' => true, 'monitor' => true], $out);
    }

    public function test_media_sound_references_are_parsed(): void
    {
        $this->assertSame(12, Catalog::mediaIdFromSound('media:12'));
        $this->assertNull(Catalog::mediaIdFromSound('kaching'));
        $this->assertNull(Catalog::mediaIdFromSound('media:abc'));
        $this->assertNull(Catalog::mediaIdFromSound(null));
    }

    public function test_upload_labels_are_short_and_printable(): void
    {
        $this->assertSame('My Logo', MediaStorage::label('My Logo!!.png'));
        $this->assertSame('Upload', MediaStorage::label('<>.png'));
        $this->assertSame(24, mb_strlen(MediaStorage::label(str_repeat('a', 40).'.mp3')));
    }

    public function test_old_popup_sizes_become_percentages_and_numbers_stay_in_range(): void
    {
        $this->assertSame(65, Catalog::popupSize('S'));
        $this->assertSame(100, Catalog::popupSize('M'));
        $this->assertSame(158, Catalog::popupSize('L'));
        $this->assertSame(135, Catalog::popupSize(135));
        $this->assertSame(Catalog::POPUP_SIZE_MIN, Catalog::popupSize(5));
        $this->assertSame(Catalog::POPUP_SIZE_MAX, Catalog::popupSize(9000));
        $this->assertSame(Catalog::POPUP_SIZE_DEFAULT, Catalog::popupSize(null));
        $this->assertSame(Catalog::POPUP_SIZE_DEFAULT, Catalog::popupSize('XL'));
    }

    public function test_a_free_popup_position_needs_both_coordinates_and_stays_on_the_stage(): void
    {
        $this->assertSame([12.35, 80.0], Catalog::popupPoint('12.345', 80));
        $this->assertSame([0.0, 100.0], Catalog::popupPoint(-5, 140));
        $this->assertSame([null, null], Catalog::popupPoint(40, null));
        $this->assertSame([null, null], Catalog::popupPoint(null, null));
    }
}
