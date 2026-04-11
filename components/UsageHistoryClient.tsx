"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TodayUsageSection from "./TodayUsageSection";
import { formatDurationCompact } from "@/lib/usage/time";
import type {
  UsageChartDay,
  UsageHistoryPayload,
  UsageHistoryRangeMode,
} from "@/lib/usage/types";

const RANGE_OPTIONS: Array<{ mode: UsageHistoryRangeMode; label: string }> = [
  { mode: "recent", label: "Recent" },
  { mode: "overall", label: "Overall" },
];
const RECENT_WINDOW_DAYS = 30;
const FEED_COLORS = ["#60a5fa", "#fb7185", "#4ade80", "#a78bfa", "#f472b6", "#38bdf8"];
const OTHER_SEGMENT_COLOR = "#64748b";
const LIMIT_LINE_COLOR = "#f59e0b";
const CHART_OTHER_THRESHOLD = 0.15;
const CHART_HEIGHT = 320;
const LABEL_HEIGHT = 40;

type ChartSegment = {
  key: string;
  label: string;
  seconds: number;
  color: string;
};

type HoveredSegment = {
  key: string;
  dayDate: string;
  label: string;
  seconds: number;
  x: number;
  top: number;
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

function formatTrackedSince(date: string | null) {
  if (!date) return "No usage tracked yet";
  return `Tracked since ${new Date(`${date}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function getPreviousDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() - 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function formatDeltaCompact(seconds: number) {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${formatDurationCompact(Math.abs(seconds))}`;
}

function getNiceStep(roughStep: number) {
  const safe = Math.max(roughStep, 60);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 3) return 3 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getAxisConfig(data: UsageChartDay[]) {
  const rawMax = data.reduce(
    (max, day) => Math.max(max, day.usageSeconds, day.limitSeconds ?? 0),
    15 * 60,
  );
  const step = getNiceStep(rawMax / 4);
  const max = Math.max(step * 4, rawMax);
  const marks = [0, step, step * 2, step * 3, step * 4];

  return { max, marks };
}

function getBarMetrics(dayCount: number) {
  if (dayCount <= 14) return { width: 22, gap: 6 };
  if (dayCount <= 31) return { width: 14, gap: 4 };
  if (dayCount <= 90) return { width: 10, gap: 3 };
  if (dayCount <= 180) return { width: 8, gap: 2 };
  return { width: 6, gap: 2 };
}

function getXAxisLabelStep(dayCount: number) {
  if (dayCount <= 14) return 1;
  if (dayCount <= 31) return 5;
  if (dayCount <= 60) return 7;
  if (dayCount <= 120) return 14;
  return 30;
}

function buildLimitPath(
  data: UsageChartDay[],
  axisMax: number,
  barWidth: number,
  gap: number,
  chartHeight: number,
  plotWidth: number,
) {
  const points: Array<{ x: number; y: number }> = [];

  data.forEach((day, index) => {
    if (day.limitSeconds == null) return;

    const x = index * (barWidth + gap) + barWidth / 2;
    const y = chartHeight - (Math.min(day.limitSeconds, axisMax) / axisMax) * chartHeight;
    points.push({ x, y });
  });

  if (points.length === 0) return null;

  const [firstPoint] = points;
  const lastPoint = points[points.length - 1];
  const commands = [`M 0 ${firstPoint.y}`, `L ${firstPoint.x} ${firstPoint.y}`];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    commands.push(`L ${point.x} ${point.y}`);
  }

  commands.push(`L ${plotWidth} ${lastPoint.y}`);
  return commands.join(" ");
}

export default function UsageHistoryClient() {
  const [rangeMode, setRangeMode] = useState<UsageHistoryRangeMode>("recent");
  const [data, setData] = useState<UsageHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/usage/history?mode=${rangeMode}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load usage history");
        const payload = (await response.json()) as UsageHistoryPayload;

        if (!ignore) {
          setData(payload);
          setSelectedDate((current) => {
            if (current && payload.chart.some((day) => day.date === current)) return current;
            if (payload.chart.some((day) => day.date === payload.today.todayKey)) return payload.today.todayKey;
            return payload.chart[payload.chart.length - 1]?.date ?? null;
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [rangeMode]);

  const axis = useMemo(() => getAxisConfig(data?.chart ?? []), [data]);

  const selectedDay = useMemo(() => {
    if (!data) return null;
    return data.chart.find((day) => day.date === selectedDate) ?? data.chart[data.chart.length - 1] ?? null;
  }, [data, selectedDate]);

  const yesterdayStats = useMemo(() => {
    if (!data) return null;

    const yesterdayKey = getPreviousDateKey(data.today.todayKey);
    const yesterdayUsage = data.chart.find((day) => day.date === yesterdayKey)?.usageSeconds ?? 0;
    const delta = yesterdayUsage - data.stats.averageSeconds;

    return {
      usageSeconds: yesterdayUsage,
      delta,
      tone:
        delta < 0 ? "text-emerald-300" : delta > 0 ? "text-red-300" : "text-gray-400",
      arrow: delta < 0 ? "↓" : delta > 0 ? "↑" : "→",
    };
  }, [data]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    if (data.rangeMode === "overall") return formatTrackedSince(data.trackedSince);
    return data.trackedSince
      ? `Last ${RECENT_WINDOW_DAYS} days, trimmed to your first tracked day`
      : `Last ${RECENT_WINDOW_DAYS} days`;
  }, [data]);

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

          <div className="inline-flex rounded-full border border-gray-800 bg-gray-950/80 p-1">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                onClick={() => setRangeMode(option.mode)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  rangeMode === option.mode
                    ? "bg-teal-400 text-gray-950"
                    : "text-gray-300 hover:bg-gray-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {data && <div className="mt-8"><TodayUsageSection status={data.today} /></div>}

        {data && (
          <section className="mt-8 grid gap-4 md:grid-cols-4">
            <StatCard label="Total usage" value={formatDurationCompact(data.stats.totalSeconds)} />
            <StatCard label="Daily average" value={formatDurationCompact(data.stats.averageSeconds)} />
            <StatCard
              label="Yesterday's Usage"
              value={formatDurationCompact(yesterdayStats?.usageSeconds ?? 0)}
              detail={
                yesterdayStats
                  ? `${yesterdayStats.arrow} ${formatDeltaCompact(yesterdayStats.delta)} vs average`
                  : null
              }
              detailClassName={yesterdayStats?.tone}
            />
            <StatCard label="Resets in" value={formatResetDistance(data.resetAt)} />
          </section>
        )}

        <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Daily usage chart</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-400">
                Hover a color band to identify the feed. Small slices still collapse into Other on the chart, and selecting a day shows the exact feed breakdown below.
              </p>
              {data && <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{rangeSummary}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-400" />
                Current day
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ backgroundColor: LIMIT_LINE_COLOR }} />
                Daily limit
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
                Start browsing Reddit to begin building your usage history.
              </p>
            </div>
          ) : (
            <UsageChart
              data={data.chart}
              axisMax={axis.max}
              axisMarks={axis.marks}
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
                Daily limits and schedules update the chart automatically, including the limit line for each tracked day.
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

function StatCard({
  label,
  value,
  detail,
  detailClassName,
}: {
  label: string;
  value: string;
  detail?: string | null;
  detailClassName?: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {detail ? (
        <p className={`mt-2 text-sm font-medium ${detailClassName ?? "text-gray-400"}`}>{detail}</p>
      ) : null}
    </div>
  );
}

function UsageChart({
  data,
  axisMax,
  axisMarks,
  selectedDate,
  onSelectDate,
  todayKey,
}: {
  data: UsageChartDay[];
  axisMax: number;
  axisMarks: number[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  todayKey: string;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const barMetrics = getBarMetrics(data.length);
  const labelStep = getXAxisLabelStep(data.length);
  const chartWidth = data.length * barMetrics.width + Math.max(0, data.length - 1) * barMetrics.gap;
  const plotWidth = Math.max(chartWidth, 640);
  const limitPath = buildLimitPath(
    data,
    axisMax,
    barMetrics.width,
    barMetrics.gap,
    CHART_HEIGHT,
    plotWidth,
  );

  return (
    <div className="mt-8 grid grid-cols-[3rem_1fr] gap-4">
      <div className="relative" style={{ height: `${CHART_HEIGHT + LABEL_HEIGHT}px` }}>
        {axisMarks.map((mark) => {
          const bottom = `${(mark / axisMax) * CHART_HEIGHT}px`;

          return (
            <div
              key={mark}
              className="absolute left-0 right-0 -translate-y-1/2 text-right text-xs text-gray-500"
              style={{ bottom }}
            >
              {formatDurationCompact(mark)}
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="relative"
          style={{ width: `${plotWidth}px`, height: `${CHART_HEIGHT + LABEL_HEIGHT}px` }}
        >
          <div
            className="absolute inset-x-0 top-0 rounded-2xl border border-gray-800 bg-gray-950/60"
            style={{ height: `${CHART_HEIGHT}px` }}
          >
            {axisMarks.map((mark) => (
              <div
                key={mark}
                className={`absolute inset-x-0 border-t ${mark === 0 ? "border-gray-700" : "border-white/8"}`}
                style={{ bottom: `${(mark / axisMax) * CHART_HEIGHT}px` }}
              />
            ))}

            {limitPath && (
              <svg
                className="pointer-events-none absolute inset-0"
                width={plotWidth}
                height={CHART_HEIGHT}
                viewBox={`0 0 ${plotWidth} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
              >
                <path
                  d={limitPath}
                  fill="none"
                  stroke={LIMIT_LINE_COLOR}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>

          {hoveredSegment && (
            <div
              className="pointer-events-none absolute z-20 w-max max-w-40 rounded-xl border border-white/10 bg-gray-950/95 px-3 py-2 text-left shadow-2xl shadow-black/40"
              style={{
                left: `${Math.min(hoveredSegment.x + barMetrics.width + 10, Math.max(8, plotWidth - 172))}px`,
                top: `${Math.min(Math.max(8, hoveredSegment.top), CHART_HEIGHT - 52)}px`,
              }}
            >
              <div className="text-xs font-medium text-white">{hoveredSegment.label}</div>
              <div className="mt-1 text-xs text-gray-300">
                {formatDurationCompact(hoveredSegment.seconds)}
              </div>
            </div>
          )}

          <div
            className="absolute left-0 top-0 flex items-end"
            style={{ gap: `${barMetrics.gap}px`, height: `${CHART_HEIGHT}px` }}
          >
            {data.map((day, index) => {
              const chartSegments = getChartSegments(day);
              const isToday = day.date === todayKey;
              const isSelected = day.date === selectedDate;
              const dayHeight = (day.usageSeconds / axisMax) * CHART_HEIGHT;
              let cumulativeSeconds = day.usageSeconds;

              return (
                <button
                  key={day.date}
                  onClick={() => onSelectDate(day.date)}
                  className="group relative h-full shrink-0"
                  style={{ width: `${barMetrics.width}px` }}
                  aria-label={`${formatDay(day.date)}: ${formatDurationCompact(day.usageSeconds)}`}
                >
                  <div className="absolute inset-x-0 bottom-0 top-0 flex items-end">
                    {day.usageSeconds > 0 ? (
                      <div
                        className={`w-full overflow-hidden rounded-t-md transition-all ${
                          isSelected
                            ? "ring-2 ring-inset ring-teal-400"
                            : isToday
                            ? "ring-1 ring-inset ring-teal-400/70"
                            : "group-hover:ring-1 group-hover:ring-inset group-hover:ring-white/20"
                        }`}
                        style={{ height: `${(day.usageSeconds / axisMax) * CHART_HEIGHT}px` }}
                      >
                        <div className="flex h-full flex-col justify-end">
                          {chartSegments.map((segment) => {
                            const isHovered = hoveredSegment?.key === segment.key;
                            const isMuted = hoveredSegment != null && !isHovered;
                            const segmentTop =
                              CHART_HEIGHT - (cumulativeSeconds / day.usageSeconds) * dayHeight;
                            cumulativeSeconds -= segment.seconds;

                            return (
                              <div
                                key={segment.key}
                                onMouseEnter={() =>
                                  setHoveredSegment({
                                    key: segment.key,
                                    dayDate: day.date,
                                    label: segment.label,
                                    seconds: segment.seconds,
                                    x: index * (barMetrics.width + barMetrics.gap),
                                    top: segmentTop,
                                  })
                                }
                                onMouseLeave={() =>
                                  setHoveredSegment((current) =>
                                    current?.key === segment.key ? null : current,
                                  )
                                }
                                className="transition-opacity duration-150"
                                style={{
                                  height: `${(segment.seconds / day.usageSeconds) * 100}%`,
                                  backgroundColor: segment.color,
                                  opacity: isMuted ? 0.28 : 1,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="h-px w-full bg-gray-800" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="absolute left-0 flex items-start"
            style={{ gap: `${barMetrics.gap}px`, top: `${CHART_HEIGHT + 8}px` }}
          >
            {data.map((day, index) => {
              const isToday = day.date === todayKey;
              const isSelected = day.date === selectedDate;
              const showLabel =
                index === 0 ||
                index === data.length - 1 ||
                isToday ||
                isSelected ||
                index % labelStep === 0;

              return (
                <div
                  key={`${day.date}-label`}
                  className="shrink-0 text-center"
                  style={{ width: `${barMetrics.width}px` }}
                >
                  {showLabel ? (
                    <div className={`text-[11px] ${isToday ? "text-teal-300" : "text-gray-500"}`}>
                      {formatDay(day.date)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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
