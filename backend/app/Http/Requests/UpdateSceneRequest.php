<?php

namespace App\Http\Requests;

use App\Models\Setup;
use App\Services\MediaReferences;
use App\Services\PopupRules;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

/**
 * What is on the live right now. Sent by the editor whenever the picture changes,
 * including unsaved edits, so the clean screen always matches the preview.
 */
class UpdateSceneRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var Setup $setup */
        $setup = $this->route('setup');

        return Gate::inspect('goLive', $setup);
    }

    public function rules(): array
    {
        return array_merge(
            ['see_through' => ['required', 'boolean']],
            PopupRules::stageRules(),
            PopupRules::rules('popups', forScene: true),
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
}
