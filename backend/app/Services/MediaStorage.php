<?php

namespace App\Services;

use App\Models\Media;
use App\Models\Setup;
use App\Models\SetupPopup;
use App\Models\User;
use GdImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Stores a seller's uploads. The real file type is detected from the content (never the
 * name), images are re-encoded to strip metadata such as GPS location, and every file
 * gets a random name so URLs can't be guessed.
 */
final class MediaStorage
{
    public const MAX_KILOBYTES = 5120;

    /** Refuse images that would decode into huge bitmaps (decompression bombs). */
    public const MAX_PIXELS = 25_000_000;

    /** Allowed content types per kind, as detected from the file's bytes. */
    public const MIME_TYPES = [
        'image' => ['image/png', 'image/webp', 'image/gif', 'image/jpeg'],
        'background' => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        'foreground' => ['image/png', 'image/webp', 'image/gif', 'image/jpeg'],
        'sound' => [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
            'audio/ogg', 'application/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/x-hx-aac-adts',
            // Some systems report .m4a audio as video/mp4; the extension rule keeps real videos out.
            'video/mp4',
        ],
    ];

    public const EXTENSIONS = [
        'image' => ['png', 'webp', 'gif', 'jpg', 'jpeg'],
        'background' => ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        'foreground' => ['png', 'webp', 'gif', 'jpg', 'jpeg'],
        'sound' => ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac'],
    ];

    private const STORED_EXTENSION = [
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'image/jpeg' => 'jpg',
    ];

    public function store(User $user, string $kind, UploadedFile $file): Media
    {
        $mime = (string) $file->getMimeType();
        $label = self::label($file->getClientOriginalName());

        if ($kind === 'sound') {
            $bytes = (string) file_get_contents($file->getRealPath());
            $extension = strtolower($file->getClientOriginalExtension()) ?: 'mp3';
            $width = $height = null;
        } else {
            [$bytes, $width, $height] = $this->sanitizeImage($file->getRealPath(), $mime);
            $extension = self::STORED_EXTENSION[$mime];
        }

        $disk = (string) config('livesell.media_disk');
        $path = sprintf('media/%d/%s.%s', $user->id, Str::lower((string) Str::ulid()), $extension);

        Storage::disk($disk)->put($path, $bytes, ['visibility' => 'public']);

        $media = new Media([
            'kind' => $kind,
            'label' => $label,
            'disk' => $disk,
            'path' => $path,
            'mime' => $mime,
            'size' => strlen($bytes),
            'width' => $width,
            'height' => $height,
        ]);
        $media->user()->associate($user);

        try {
            $media->save();
        } catch (\Throwable $e) {
            Storage::disk($disk)->delete($path); // don't leave an orphaned file behind
            throw $e;
        }

        return $media;
    }

    /**
     * Removes the record first (and everything using it: popups showing it, setups with it as
     * their background or foreground), then the file once that is committed.
     */
    public function delete(Media $media): void
    {
        DB::transaction(function () use ($media): void {
            SetupPopup::query()->where('media_id', $media->id)->delete();
            SetupPopup::query()->where('sound', 'media:'.$media->id)->update(['sound' => null]);
            if (in_array($media->kind, ['background', 'foreground'], true)) {
                $this->detachFromSetups($media);
            }
            $media->delete();
        });

        Storage::disk($media->disk)->delete($media->path);
    }

    /**
     * Setups that used this photo go back to their built-in background (the preset they
     * keep), or have their foreground turned off, in their settings and live picture alike.
     * Otherwise they'd point at a missing photo and saving them would be refused.
     */
    private function detachFromSetups(Media $media): void
    {
        $part = $media->kind; // "background" or "foreground", the setup's column and scene key
        $clear = fn (array $settings): array => $part === 'foreground'
            ? array_merge($settings, ['media_id' => null, 'enabled' => false])
            : array_merge($settings, ['media_id' => null]);
        $uses = fn (?array $settings): bool => (int) ($settings['media_id'] ?? 0) === $media->id;

        Setup::query()->where('user_id', $media->user_id)->get()->each(function (Setup $setup) use ($part, $clear, $uses): void {
            $changes = [];
            if ($uses($setup->{$part})) {
                $changes[$part] = $clear($setup->{$part});
            }
            $scene = $setup->scene;
            if (is_array($scene) && $uses($scene[$part] ?? null)) {
                $scene[$part] = $clear($scene[$part]);
                $changes['scene'] = $scene;
            }
            if ($changes !== []) {
                // Not an edit by the seller, so "last edited" stays as it was.
                $setup->timestamps = false;
                $setup->forceFill($changes)->save();
            }
        });
    }

    /**
     * Re-encodes an uploaded image (drops hidden metadata such as location, fixes rotation).
     * Also used for payment receipts; $field is the form field errors are reported on.
     *
     * @return array{0: string, 1: int, 2: int} bytes, width, height
     */
    public function sanitizeImage(string $path, string $mime, string $field = 'file'): array
    {
        $info = @getimagesize($path);
        if ($info === false || $info[0] < 1 || $info[1] < 1) {
            throw ValidationException::withMessages([$field => 'That image could not be read. Try another file.']);
        }
        [$width, $height] = $info;
        if ($width * $height > self::MAX_PIXELS) {
            throw ValidationException::withMessages([$field => 'That image is too large. Keep it under 25 megapixels.']);
        }

        // GD can't keep GIF animation, and GIFs carry no location data, so keep them as-is.
        if ($mime === 'image/gif') {
            return [(string) file_get_contents($path), $width, $height];
        }

        $image = @imagecreatefromstring((string) file_get_contents($path));
        if (! $image instanceof GdImage) {
            throw ValidationException::withMessages([$field => 'That image could not be read. Animated WEBP files are not supported.']);
        }

        if ($mime === 'image/jpeg') {
            $image = $this->applyExifOrientation($image, $path);
        }

        imagepalettetotruecolor($image);
        imagealphablending($image, false);
        imagesavealpha($image, true);

        ob_start();
        $ok = match ($mime) {
            'image/png' => imagepng($image, null, 6),
            'image/webp' => imagewebp($image, null, 88),
            default => imagejpeg($image, null, 88),
        };
        $bytes = (string) ob_get_clean();
        $width = imagesx($image);
        $height = imagesy($image);
        imagedestroy($image);

        if (! $ok || $bytes === '') {
            throw ValidationException::withMessages([$field => 'That image could not be saved. Try another file.']);
        }

        return [$bytes, $width, $height];
    }

    /** Phone photos store rotation in EXIF; bake it in because EXIF is stripped. */
    private function applyExifOrientation(GdImage $image, string $path): GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }
        $exif = @exif_read_data($path);
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $image;
        }
        $rotated = imagerotate($image, $angle, 0);
        if ($rotated instanceof GdImage) {
            imagedestroy($image);

            return $rotated;
        }

        return $image;
    }

    /** A short, printable name from the uploaded file name, e.g. "my-logo". */
    public static function label(string $originalName): string
    {
        $name = pathinfo($originalName, PATHINFO_FILENAME);
        $name = (string) preg_replace('/[^\pL\pN \-_.]+/u', '', $name);
        $name = trim((string) preg_replace('/\s+/u', ' ', $name));

        return mb_substr($name, 0, 24) ?: 'Upload';
    }
}
