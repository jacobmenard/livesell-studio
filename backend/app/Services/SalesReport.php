<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Plan;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * Sales from approved payments, by day, week (Monday to Sunday) or calendar month. A sale
 * counts on the day it was approved (the money was confirmed and the plan started), in the
 * app's time zone, which is also how the timestamps are stored.
 */
final class SalesReport
{
    public const PERIODS = ['daily', 'weekly', 'monthly'];

    /** The most rows one report has, so a request can't ask for years of days. */
    private const MAX_ROWS = ['daily' => 366, 'weekly' => 104, 'monthly' => 60];

    /** Rows shown when no dates are given (ending with the current day, week or month). */
    private const DEFAULT_ROWS = ['daily' => 30, 'weekly' => 12, 'monthly' => 12];

    /**
     * @return array{period: string, from: string, to: string, currency: string, total: int, count: int,
     *     rows: list<array{start: string, end: string, total: int, count: int}>,
     *     by_plan: list<array{plan_id: int, name: string, total: int, count: int}>}
     */
    public function build(string $period, ?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $to = $this->endOf($period, $to ?? CarbonImmutable::today());
        $from = $this->startOf($period, $from ?? $this->shift($period, $to, 1 - self::DEFAULT_ROWS[$period]));
        if ($from->greaterThan($to)) {
            throw ValidationException::withMessages(['from' => 'The start date must be on or before the end date.']);
        }

        $rows = [];
        for ($start = $from; $start->lessThanOrEqualTo($to); $start = $this->shift($period, $start, 1)) {
            if (count($rows) === self::MAX_ROWS[$period]) {
                throw ValidationException::withMessages(['from' => 'Choose a shorter range: at most '.self::MAX_ROWS[$period].' '.$this->unit($period).'.']);
            }
            $rows[$start->toDateString()] = ['start' => $start->toDateString(), 'end' => $this->endOf($period, $start)->toDateString(), 'total' => 0, 'count' => 0];
        }

        // Plans are priced in one currency (admins can't change it); only that one is added up.
        $currency = Plan::default()->currency;
        $sales = Payment::query()
            ->where('status', Payment::APPROVED)
            ->where('currency', $currency)
            ->whereBetween('reviewed_at', [$from->startOfDay(), $to->endOfDay()]);

        $days = (clone $sales)
            ->selectRaw('DATE(reviewed_at) as day, COUNT(*) as payments, SUM(amount) as amount')
            ->groupByRaw('DATE(reviewed_at)')
            ->toBase()
            ->get();
        foreach ($days as $day) {
            $key = $this->startOf($period, CarbonImmutable::parse($day->day))->toDateString();
            $rows[$key]['total'] += (int) $day->amount;
            $rows[$key]['count'] += (int) $day->payments;
        }

        $plans = (clone $sales)
            ->selectRaw('plan_id, COUNT(*) as payments, SUM(amount) as amount')
            ->groupBy('plan_id')
            ->toBase()
            ->get();
        $names = Plan::query()->whereIn('id', $plans->pluck('plan_id'))->pluck('name', 'id');
        $byPlan = $plans
            ->map(fn ($p) => ['plan_id' => (int) $p->plan_id, 'name' => (string) ($names[$p->plan_id] ?? 'Removed plan'), 'total' => (int) $p->amount, 'count' => (int) $p->payments])
            ->sortByDesc('total')
            ->values()
            ->all();

        return [
            'period' => $period,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'currency' => $currency,
            'total' => array_sum(array_column($rows, 'total')),
            'count' => array_sum(array_column($rows, 'count')),
            'rows' => array_values($rows),
            'by_plan' => $byPlan,
        ];
    }

    private function startOf(string $period, CarbonImmutable $date): CarbonImmutable
    {
        return match ($period) {
            'daily' => $date->startOfDay(),
            'weekly' => $date->startOfWeek(CarbonImmutable::MONDAY),
            'monthly' => $date->startOfMonth(),
        };
    }

    private function endOf(string $period, CarbonImmutable $date): CarbonImmutable
    {
        return match ($period) {
            'daily' => $date->startOfDay(),
            'weekly' => $date->endOfWeek(CarbonImmutable::SUNDAY)->startOfDay(),
            'monthly' => $date->endOfMonth()->startOfDay(),
        };
    }

    private function shift(string $period, CarbonImmutable $date, int $by): CarbonImmutable
    {
        return match ($period) {
            'daily' => $date->addDays($by),
            'weekly' => $date->addWeeks($by),
            'monthly' => $date->addMonthsNoOverflow($by),
        };
    }

    private function unit(string $period): string
    {
        return ['daily' => 'days', 'weekly' => 'weeks', 'monthly' => 'months'][$period];
    }
}
