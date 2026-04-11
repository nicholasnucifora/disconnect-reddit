"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TodayUsageSection from "./TodayUsageSection";
import { formatDurationCompact } from "@/lib/usage/time";
import type { UsageChartDay, UsageHistoryPayload } from "@/lib/usage/types";

const RANGE_OPTIONS = [7, 30, 90] as const;
const FEED_COLORS = ["#60a5fa", "#fb7185", "#4ade80", "#a78bfa", "#f472b6", "#38bdf8"];
const OTHER_SEGMENT_COLOR = "#64748b";
const CHART_OTHER_THRESHOLD = 0.15;

type ChartSegment = {
  key: string;
  label: string;
  seconds: number;
  color: string;
};

function getFeedColor(feedId: string) {
  let hash = 0;
  for (const char of feedId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FEED_COLORS[hash % FEED_COLORS.length];
}

function getChartSegments(day: UsageChartDay): ChartSegment[] {
  if (day.usageSeconds <= 0) return [];

  let otherSeconds = 0;
  const prominentSegments: ChartSegment[] = [];

  for (const segment of day.feedSegments) {
    const share = segment.seconds / day.usageSeconds;

    if (share < CHART_OTHER_THRESHOLD) {
      otherSeconds += segment.seconds;
      continue;
    }

    prominentSegments.push({
      key: `${day.date}-${segment.feedId}`,
      label: segment.feedName,
      seconds: segment.seconds,
      color: getFeedColor(segment.feedId),
    });
  }

  if (otherSeconds > 0) {
    prominentSegments.push({
      key: `${day.date}-other`,
      label: "Other",
      seconds: otherSeconds,
      color: OTHER_SEGMENT_COLOR,
    });
  }

  return prominentSegments.sort((a, b) => b.seconds - a.seconds);
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
    return data.chart.find((day) => day.date === selectedDate) ?? data.chart[data.chart.length - 1] ?? null;
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
              Watch Time
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
              <p className="mt-1 max-w-2xl text-sm text-gray-400">
                Hover a color band to see its feed. Feeds under 15% of a day collapse into Other on the chart, and selecting a day shows the exact breakdown below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-400" />
                Current day
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-slate-200" />
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
                href="/settings"
                className="mt-5 inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-white"
              >
                Open settings
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
  const [hoveredSegmentKey, setHoveredSegmentKey] = useState<string | null>(null);
  const chartWidth = Math.max(720, data.length * 42);

  return (
    <div className="mt-8 overflow-x-auto">
      <div className="relative" style={{ minWidth: `${chartWidth}px` }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-10">
          {[0, 25, 50, 75, 100].map((mark) => (
            <div
              key={mark}
              className={`absolute inset-x-0 border-t ${mark === 0 ? "border-gray-800" : "border-white/8"}`}
              style={{ bottom: `${mark}%` }}
            />
          ))}
        </div>

        <div className="relative flex h-80 items-end gap-2">
          {data.map((day) => {
            const chartSegments = getChartSegments(day);
            const limitHeight = day.limitSeconds ? (day.limitSeconds / maxValue) * 100 : null;
            const isToday = day.date === todayKey;
            const exceeded = day.limitSeconds != null && day.usageSeconds > day.limitSeconds;
            const hoveredSegment = chartSegments.find((segment) => segment.key === hoveredSegmentKey) ?? null;

            return (
              <button
                key={day.date}
                onClick={() => onSelectDate(day.date)}
                className="group relative flex h-full flex-1 flex-col justify-end text-left"
                aria-label={`${formatDay(day.date)}: ${formatDurationCompact(day.usageSeconds)}`}
              >
                <div
                  className={`relative h-64 overflow-hidden rounded-[1.4rem] bg-gray-950/80 ring-1 ring-inset transition-all ${
                    selectedDate === day.date
                      ? "ring-2 ring-teal-400/90"
                      : exceeded
                      ? "ring-red-400/45"
                      : "ring-white/8 group-hover:ring-white/18"
                  }`}
                >
                  {hoveredSegment && (
                    <div className="pointer-events-none absolute left-2 right-2 top-2 z-20 rounded-xl border border-white/10 bg-gray-950/95 px-3 py-2 shadow-2xl shadow-black/40">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-white">{hoveredSegment.label}</span>
                        <span className="text-xs text-gray-300">
                          {formatDurationCompact(hoveredSegment.seconds)}
                        </span>
                      </div>
                    </div>
                  )}

                  {limitHeight != null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-slate-200/85"
                      style={{ bottom: `${limitHeight}%` }}
                    />
                  )}

                  <div className="absolute inset-0 flex flex-col justify-end overflow-hidden">
                    {chartSegments.length === 0 ? (
                      <div className="h-1.5 bg-gray-800" />
                    ) : (
                      chartSegments.map((segment) => {
                        const isHovered = hoveredSegmentKey === segment.key;
                        const isMuted = hoveredSegmentKey != null && !isHovered;

                        return (
                          <div
                            key={segment.key}
                            title={`${segment.label}: ${formatDurationCompact(segment.seconds)}`}
                            onMouseEnter={() => setHoveredSegmentKey(segment.key)}
                            onMouseLeave={() => setHoveredSegmentKey((current) => (current === segment.key ? null : current))}
                            className="relative transition-opacity duration-150"
                            style={{
                              height: `${(segment.seconds / maxValue) * 100}%`,
                              backgroundColor: segment.color,
                              opacity: isMuted ? 0.32 : 1,
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-3 px-1">
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
        <p className="mt-2 text-sm text-gray-500">
          Small chart slices roll into Other, but every tracked feed for this day is listed here.
        </p>
        <div className="mt-4 space-y-3">
          {day.feedSegments.length === 0 ? (
            <p className="text-sm text-gray-500">No tracked feed activity for this day.</p>
          ) : (
            day.feedSegments.map((segment) => (
              <div key={segment.feedId} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getFeedColor(segment.feedId) }}
                    />
                    <span className="font-medium text-white">{segment.feedName}</span>
                  </div>
                  <span className="text-sm text-gray-300">{formatDurationCompact(segment.seconds)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${day.usageSeconds ? (segment.seconds / day.usageSeconds) * 100 : 0}%`,
                      backgroundColor: getFeedColor(segment.feedId),
                    }}
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
              <div
                key={`${segment.feedId}-${segment.subreddit}`}
                className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-950/70 px-4 py-3"
              >
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
