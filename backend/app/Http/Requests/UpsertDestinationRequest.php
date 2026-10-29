<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpsertDestinationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'server_url' => ['required', 'string', 'max:300', 'regex:/^rtmps?:\/\/[^\s\/]+\.[^\s]+$/i'],
            // Not the whole stream URL (server + key), which Live Producer also offers to copy.
            'stream_key' => ['required', 'string', 'max:300', 'regex:/^\S+$/', 'not_regex:/^rtmps?:\/\//i'],
        ];
    }

    public function messages(): array
    {
        return [
            'server_url.regex' => 'The server URL should start with rtmp:// or rtmps://',
            'stream_key.regex' => 'Stream keys have no spaces. Check you copied all of it.',
            'stream_key.not_regex' => 'That’s the whole stream URL. Paste only the stream key.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'server_url' => is_string($this->input('server_url')) ? trim($this->input('server_url')) : $this->input('server_url'),
            'stream_key' => is_string($this->input('stream_key')) ? trim($this->input('stream_key')) : $this->input('stream_key'),
        ]);
    }
}
