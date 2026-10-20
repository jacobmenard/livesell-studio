<?php

namespace App\Http\Resources;

use App\Models\PaymentMethod;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A way to pay: shown to sellers in the pay dialog (enabled ones only), and to the superadmin
 * to edit.
 *
 * @mixin PaymentMethod
 */
class PaymentMethodResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'label' => $this->label,
            'name' => $this->displayName(),
            'account_name' => $this->account_name,
            'account_number' => $this->account_number,
            'instructions' => $this->instructions,
            'enabled' => $this->enabled,
            'sort_order' => $this->sort_order,
        ];
    }
}
