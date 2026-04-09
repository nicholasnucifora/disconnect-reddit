"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TodayUsageSection from "./TodayUsageSection";
import { formatDurationCompact } from "@/lib/usage/time";
import type { UsageChartDay, UsageHistoryPayload } from "@/lib/usage/types";

const RANGE_OPTIONS = [7, 30, 90] as const;
const FEED_COLORS = [
  "bg-teal-400",
  "bg-sky-400",
  "bg-amber-400",
  "bg-pink-400",
  "bg-violet-400",
  "bg-emerald-400",
];

function getFeedColor(feedId: string) {
  let hash = 0;
  for (const char of feedId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FEED_COLORS[hash % FEED_COLORS.length];
}

function formatResetDistance(resetAt: string) {
  const seconds = Math.max(0, Math.floor((new Date(resetAt).getTime() - Date.now()) / 1000));
  return formatDurationCompact(seconds);
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function UsageHistoryClient() {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [data, setData] = useState<UsageHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/usage/history?days=${days}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load usage history");
        const payload = (await response.json()) as UsageHistoryPayload;
        if (!ignore) {
          setData(payload);
          setSelectedDate(payload.today.todayKey);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [days]);

  const chartMax = useMemo(() => {
    if (!data?.chart.length) return 3600;
    const values = data.chart.flatMap((day) => [day.usageSeconds, day.limitSeconds ?? 0]);
    return Math.max(3600, ...values);
  }, [data]);

  const selectedDay = useMemo(() => {
    if (!data) return null;
    return (
      data.chart.find((day) => day.date === selectedDate) ??
      data.chart[data.chart.length - 1] ??
      null
    );
  }, [data, selectedDate]);

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Daily usage
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              Usage History
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
              Track total Reddit time, today&apos;s schedule state, and which feeds or subreddits took the day.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setDays(option)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  days === option
                    ? "bg-teal-400 text-gray-950"
                    : "bg-gray-900 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {option} days
              </button>
            ))}
          </div>
        </div>

        {data && <div className="mt-8"><TodayUsageSection status={data.today} /></div>}

        {data && (
          <section className="mt-8 grid gap-4 md:grid-cols-4">
            <StatCard label="Total usage" value={formatDurationCompact(data.stats.totalSeconds)} />
            <StatCard label="Active days" value={String(data.stats.activeDays)} />
            <StatCard label="Daily average" value={formatDurationCompact(data.stats.averageSeconds)} />
            <StatCard label="Resets in" value={formatResetDistance(data.resetAt)} />
          </section>
        )}

        <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Daily usage chart</h2>
              <p className="mt-1 text-sm text-gray-400">
                Bars are stacked by feed. Limit markers show the day&apos;s effective allowance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-400" />
                Current day
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-amber-400" />
                Daily limit
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Exceeded day
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex h-80 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            </div>
          ) : !data || data.chart.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center text-center">
              <p className="text-lg font-medium text-white">No usage data yet</p>
              <p className="mt-2 max-w-md text-sm text-gray-400">
                Start browsing Reddit to see your usage history and feed breakdown.
              </p>
            </div>
          ) : (
            <UsageChart
              data={data.chart}
              maxValue={chartMax}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              todayKey={data.today.todayKey}
            />
          )}
        </section>

        {selectedDay && (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <BreakdownPanel day={selectedDay} />
            <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <h3 className="text-lg font-semibold text-white">Manage daily usage</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                This app now enforces total Reddit time and optional schedules. Limits and schedules come from the backend tables described in the implementation notes.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-white"
              >
                Back to Reddit feeds
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function UsageChart({
  data,
  maxValue,
  selectedDate,
  onSelectDate,
  todayKey,
}: {
  data: UsageChartDay[];
  maxValue: number;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  todayKey: string;
}) {
  return (
    <div className="mt-8 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="flex h-80 items-end gap-3">
          {data.map((day) => {
            const limitHeight = day.limitSeconds ? (day.limitSeconds / maxValue) * 100 : null;
            const isToday = day.date === todayKey;
            const exceeded = day.limitSeconds != null && day.usageSeconds > day.limitSeconds;

            return (
              <button
                key={day.date}
                onClick={() => onSelectDate(day.date)}
                className={`group relative flex flex-1 flex-col justify-end rounded-2xl border px-2 py-3 text-left transition-colors ${
                  selectedDate === day.date
                    ? "border-teal-400 bg-gray-950"
                    : "border-gray-800 bg-gray-950/70 hover:border-gray-700"
                }`}
              >
                <div className="relative h-60">
                  {limitHeight != null && (
                    <div
                      className="absolute left-0 right-0 z-10 border-t-2 border-amber-400/90"
                      style={{ bottom: `${limitHeight}%` }}
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex h-full flex-col justify-end overflow-hidden rounded-xl bg-gray-900">
                    {day.feedSegments.map((segment) => (
                      <div
                        key={`${day.date}-${segment.feedId}`}
                        className={getFeedColor(segment.feedId)}
                        style={{ height: `${(segment.seconds / maxValue) * 100}%` }}
                      />
                    ))}
                    {day.usageSeconds === 0 && <div className="h-1 rounded-xl bg-gray-800" />}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${isToday ? "text-teal-300" : "text-gray-500"}`}>
                      {formatDay(day.date)}
                    </span>
                    {exceeded && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300">
                        Over
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {formatDurationCompact(day.usageSeconds)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BreakdownPanel({ day }: { day: UsageChartDay }) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Selected day</p>
          <h3 className="mt-1 text-2xl font-semibold text-white">{formatDay(day.date)}</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Total</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatDurationCompact(day.usageSeconds)}</p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">
          Feed breakdown
        </h4>
        <div className="mt-4 space-y-3">
          {day.feedSegments.length === 0 ? (
            <p className="text-sm text-gray-500">No tracked feed activity for this day.</p>
          ) : (
            day.feedSegments.map((segment) => (
              <div key={segment.feedId} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${getFeedColor(segment.feedId)}`} />
                    <span className="font-medium text-white">{segment.feedName}</span>
                  </div>
                  <span className="text-sm text-gray-300">{formatDurationCompact(segment.seconds)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full rounded-full ${getFeedColor(segment.feedId)}`}
                    style={{ width: `${day.usageSeconds ? (segment.seconds / day.usageSeconds) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">
          Subreddit breakdown
        </h4>
        <div className="mt-4 space-y-3">
          {day.subredditSegments.length === 0 ? (
            <p className="text-sm text-gray-500">
              No subreddit-specific data was captured for this day. Mixed feed browsing is still counted toward feed totals.
            </p>
          ) : (
            day.subredditSegments.slice(0, 8).map((segment) => (
              <div key={`${segment.feedId}-${segment.subreddit}`} className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-950/70 px-4 py-3">
                <div>
                  <div className="font-medium text-white">r/{segment.subreddit}</div>
                  <div className="text-xs text-gray-500">{segment.feedName}</div>
                </div>
                <div className="text-sm text-gray-300">{formatDurationCompact(segment.seconds)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
