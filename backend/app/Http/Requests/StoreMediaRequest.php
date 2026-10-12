<?php

namespace App\Http\Requests;

use App\Services\MediaStorage;
use App\Support\Catalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $kind = in_array($this->input('kind'), Catalog::MEDIA_KINDS, true) ? $this->input('kind') : 'image';

        return [
            'kind' => ['required', Rule::in(Catalog::MEDIA_KINDS)],
            'file' => [
                'required',
                'file',
                'max:'.MediaStorage::MAX_KILOBYTES,
                // mimetypes checks the type detected from the file's content.
                'mimetypes:'.implode(',', MediaStorage::MIME_TYPES[$kind]),
                'extensions:'.implode(',', MediaStorage::EXTENSIONS[$kind]),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'file.max' => 'File is too big. Keep it at 5 MB or less.',
            'file.mimetypes' => 'That file type is not supported.',
            'file.extensions' => 'That file type is not supported.',
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $limit = (int) config('livesell.max_media_per_user');
                if ($this->user()->accountOwner()->media()->count() >= $limit) {
                    $validator->errors()->add('file', "You have reached the limit of {$limit} uploads. Delete some to add more.");
                }
            },
        ];
    }
}
