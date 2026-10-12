<?php

namespace App\Http\Resources;

use App\Models\Plan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Plan */
class PlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'price_monthly' => $this->price_monthly,
            'currency' => $this->currency,
            'max_subusers' => $this->max_subusers,
            'max_live_setups' => $this->max_live_setups,
            'purchasable' => $this->purchasable,
        ];
    }
}
