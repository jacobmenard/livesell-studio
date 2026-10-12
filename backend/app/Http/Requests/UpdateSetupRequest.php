<?php

namespace App\Http\Requests;

use App\Models\Setup;
use App\Services\MediaReferences;
use App\Services\PopupRules;
use App\Support\Catalog;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * The whole setup document, as saved by the editor's "Save setup" button.
 */
class UpdateSetupRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var Setup $setup */
        $setup = $this->route('setup');

        return Gate::inspect('update', $setup);
    }

    public function rules(): array
    {
        return array_merge(
            [
                'name' => ['required', 'string', 'max:60', 'not_regex:/[\x00-\x1F\x7F]/u'],
                'resolution' => ['required', Rule::in(Catalog::RESOLUTIONS)],
                'sound_settings' => ['required', 'array:volume,to_stream,monitor'],
                'sound_settings.volume' => ['required', 'integer', 'between:0,100'],
                'sound_settings.to_stream' => ['required', 'boolean'],
                'sound_settings.monitor' => ['required', 'boolean'],
                'output_settings' => ['required', 'array:method,see_through,safe_zones'],
                'output_settings.method' => ['required', Rule::in(Catalog::OUTPUT_METHODS)],
                'output_settings.see_through' => ['required', 'boolean'],
                'output_settings.safe_zones' => ['required', 'boolean'],
            ],
            PopupRules::stageRules(),
            PopupRules::rules('popups', forScene: false),
        );
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                MediaReferences::validate(
                    $validator,
                    $this->user(),
                    (array) $this->input('popups', []),
                    (array) $this->input('background', []),
                    'popups',
                    'background',
                    is_array($this->input('foreground')) ? $this->input('foreground') : null,
                );
            },
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }
}
