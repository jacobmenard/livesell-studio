<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\SalesReport;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Superadmin: sales from approved payments, by day, week or month. */
class ReportController extends Controller
{
    public function __construct(private readonly SalesReport $report) {}

    public function sales(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['sometimes', Rule::in(SalesReport::PERIODS)],
            'from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ]);
        $date = fn (?string $value) => $value === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $value);

        return response()->json([
            'data' => $this->report->build($data['period'] ?? 'daily', $date($data['from'] ?? null), $date($data['to'] ?? null)),
        ]);
    }
}
