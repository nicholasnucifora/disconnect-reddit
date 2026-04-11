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
const CHART_MODE_OPTIONS = [
  { mode: "time", label: "Time" },
  { mode: "opens", label: "Opens" },
] as const;
const RECENT_WINDOW_DAYS = 30;
const FEED_COLORS = ["#60a5fa", "#fb7185", "#4ade80", "#a78bfa", "#f472b6", "#38bdf8"];
const OTHER_SEGMENT_COLOR = "#64748b";
const LIMIT_LINE_COLOR = "#f59e0b";
const OPEN_BAR_COLOR = "#2dd4bf";
const CHART_OTHER_THRESHOLD = 0.15;
const CHART_HEIGHT = 320;
const LABEL_HEIGHT = 40;

type ChartMode = (typeof CHART_MODE_OPTIONS)[number]["mode"];

type ChartSegment = {
  key: string;
  label: string;
  seconds: number;
  color: string;
};

type HoveredSegment = {
  key: string;
  label: string;
  value: number;
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

function getChartValue(day: UsageChartDay, mode: ChartMode) {
  return mode === "time" ? day.usageSeconds : day.openCount;
}

function getChartLimit(day: UsageChartDay, mode: ChartMode) {
  return mode === "time" ? day.limitSeconds : day.openLimit;
}

function formatMetricValue(value: number, mode: ChartMode) {
  return mode === "time" ? formatDurationCompact(value) : formatOpenCount(value);
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

function formatOpenCount(count: number) {
  return count === 1 ? "1 open" : `${count} opens`;
}

function formatOpenDelta(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatOpenCount(Math.abs(value))}`;
}

function getNiceStep(roughStep: number, minimum: number) {
  const safe = Math.max(roughStep, minimum);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 3) return 3 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getAxisConfig(data: UsageChartDay[], mode: ChartMode) {
  const rawMax = data.reduce(
    (max, day) => Math.max(max, getChartValue(day, mode), getChartLimit(day, mode) ?? 0),
    mode === "time" ? 15 * 60 : 4,
  );
  const step = getNiceStep(rawMax / 4, mode === "time" ? 60 : 1);
  const max = Math.max(step * 4, rawMax);
  const marks = [0, step, step * 2, step * 3, step * 4];

  return { max, marks };
}

function formatAxisMark(value: number, mode: ChartMode) {
  return mode === "time" ? formatDurationCompact(value) : String(value);
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
  mode: ChartMode,
  axisMax: number,
  barWidth: number,
  gap: number,
  chartHeight: number,
  plotWidth: number,
) {
  const points: Array<{ x: number; y: number }> = [];

  data.forEach((day, index) => {
    const limit = getChartLimit(day, mode);
    if (limit == null) return;

    const x = index * (barWidth + gap) + barWidth / 2;
    const y = chartHeight - (Math.min(limit, axisMax) / axisMax) * chartHeight;
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

function getChartDescription(mode: ChartMode) {
  return mode === "time"
    ? "Hover a color band to identify the feed. Small slices still collapse into Other on the chart, and clicking the same day again clears the selection back to the range average below."
    : "Flip to opens to see how many separate app launches were registered each day. Clicking the same day again clears the selection back to the range average below.";
}

function getLimitLegendLabel(mode: ChartMode) {
  return mode === "time" ? "Daily limit" : "Open limit";
}

function getDeltaArrow(delta: number) {
  if (delta < 0) return "v";
  if (delta > 0) return "^";
  return "=";
}

function getDeltaTone(delta: number) {
  if (delta < 0) return "text-emerald-300";
  if (delta > 0) return "text-red-300";
  return "text-gray-400";
}

export default function UsageHistoryClient() {
  const [rangeMode, setRangeMode] = useState<UsageHistoryRangeMode>("recent");
  const [chartMode, setChartMode] = useState<ChartMode>("time");
  const [data, setData] = useState<UsageHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null | undefined>(undefined);

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
            if (current === null) return null;
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

  const axis = useMemo(() => getAxisConfig(data?.chart ?? [], chartMode), [data, chartMode]);

  const selectedDay = useMemo(() => {
    if (!data || selectedDate == null) return null;
    return data.chart.find((day) => day.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const yesterdayStats = useMemo(() => {
    if (!data) return null;

    const yesterdayKey = getPreviousDateKey(data.today.todayKey);
    const yesterdayDay = data.chart.find((day) => day.date === yesterdayKey);
    const yesterdayUsage = yesterdayDay?.usageSeconds ?? 0;
    const yesterdayOpens = yesterdayDay?.openCount ?? 0;

    return {
      usageSeconds: yesterdayUsage,
      openCount: yesterdayOpens,
      usageDelta: yesterdayUsage - data.stats.averageSeconds,
      openDelta: yesterdayOpens - data.stats.averageOpens,
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
              Track total Reddit time, app opens, today&apos;s schedule state, and which feeds or subreddits took the day.
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
            <StatCard
              label="Total usage"
              value={formatDurationCompact(data.stats.totalSeconds)}
              detail={`${formatOpenCount(data.stats.totalOpens)} total`}
            />
            <DualMetricCard
              label="Daily average"
              metrics={[
                { label: "Time spent", value: formatDurationCompact(data.stats.averageSeconds) },
                { label: "Times opened", value: formatOpenCount(data.stats.averageOpens) },
              ]}
              footer={
                data.stats.averageDayCount > 0
                  ? `Across ${data.stats.averageDayCount} completed tracked day${
                      data.stats.averageDayCount === 1 ? "" : "s"
                    }`
                  : "Waiting for a completed tracked day"
              }
            />
            <DualMetricCard
              label="Yesterday's Usage"
              metrics={[
                {
                  label: "Time spent",
                  value: formatDurationCompact(yesterdayStats?.usageSeconds ?? 0),
                  detail: yesterdayStats
                    ? `${getDeltaArrow(yesterdayStats.usageDelta)} ${formatDeltaCompact(yesterdayStats.usageDelta)} vs average`
                    : null,
                  detailClassName: getDeltaTone(yesterdayStats?.usageDelta ?? 0),
                },
                {
                  label: "Times opened",
                  value: formatOpenCount(yesterdayStats?.openCount ?? 0),
                  detail: yesterdayStats
                    ? `${getDeltaArrow(yesterdayStats.openDelta)} ${formatOpenDelta(yesterdayStats.openDelta)} vs average`
                    : null,
                  detailClassName: getDeltaTone(yesterdayStats?.openDelta ?? 0),
                },
              ]}
            />
            <StatCard label="Resets in" value={formatResetDistance(data.resetAt)} />
          </section>
        )}

        <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Daily usage chart</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-400">
                {getChartDescription(chartMode)}
              </p>
              {data && <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{rangeSummary}</p>}
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <div className="inline-flex rounded-full border border-gray-800 bg-gray-950/80 p-1">
                {CHART_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    onClick={() => setChartMode(option.mode)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      chartMode === option.mode
                        ? "bg-teal-400 text-gray-950"
                        : "text-gray-300 hover:bg-gray-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  Current day
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-0.5 w-4" style={{ backgroundColor: LIMIT_LINE_COLOR }} />
                  {getLimitLegendLabel(chartMode)}
                </span>
              </div>
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
              mode={chartMode}
              axisMax={axis.max}
              axisMarks={axis.marks}
              selectedDate={selectedDate ?? null}
              onSelectDate={setSelectedDate}
              todayKey={data.today.todayKey}
            />
          )}
        </section>

        {data && data.chart.length > 0 && (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <BreakdownPanel
              selectedDay={selectedDay}
              rangeAverage={data.rangeAverage}
              rangeMode={data.rangeMode}
              onReset={() => setSelectedDate(null)}
            />
            <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <h3 className="text-lg font-semibold text-white">Manage daily usage</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Daily time limits, open caps, and schedules update the chart automatically, including the limit line for each tracked day.
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

function DualMetricCard({
  label,
  metrics,
  footer,
}: {
  label: string;
  metrics: Array<{
    label: string;
    value: string;
    detail?: string | null;
    detailClassName?: string;
  }>;
  footer?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-4 space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              {metric.label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">{metric.value}</div>
            {metric.detail ? (
              <div className={`mt-1 text-sm font-medium ${metric.detailClassName ?? "text-gray-400"}`}>
                {metric.detail}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {footer ? <p className="mt-4 text-sm text-gray-400">{footer}</p> : null}
    </div>
  );
}

function UsageChart({
  data,
  mode,
  axisMax,
  axisMarks,
  selectedDate,
  onSelectDate,
  todayKey,
}: {
  data: UsageChartDay[];
  mode: ChartMode;
  axisMax: number;
  axisMarks: number[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  todayKey: string;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const barMetrics = getBarMetrics(data.length);
  const labelStep = getXAxisLabelStep(data.length);
  const chartWidth = data.length * barMetrics.width + Math.max(0, data.length - 1) * barMetrics.gap;
  const plotWidth = Math.max(chartWidth, 640);
  const limitPath = buildLimitPath(
    data,
    mode,
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
              {formatAxisMark(mark, mode)}
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
                {formatMetricValue(hoveredSegment.value, mode)}
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
              const chartValue = getChartValue(day, mode);
              const dayHeight = (chartValue / axisMax) * CHART_HEIGHT;
              let cumulativeSeconds = day.usageSeconds;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate(day.date === selectedDate ? null : day.date)}
                  className="group relative h-full shrink-0"
                  style={{ width: `${barMetrics.width}px` }}
                  aria-label={`${formatDay(day.date)}: ${formatMetricValue(chartValue, mode)}`}
                  aria-pressed={isSelected}
                >
                  <div className="absolute inset-x-0 bottom-0 top-0 flex items-end">
                    {chartValue > 0 ? (
                      <div
                        className={`w-full overflow-hidden rounded-t-md transition-all ${
                          isSelected
                            ? "ring-2 ring-inset ring-teal-400"
                            : isToday
                            ? "ring-1 ring-inset ring-teal-400/70"
                            : "group-hover:ring-1 group-hover:ring-inset group-hover:ring-white/20"
                        }`}
                        style={{ height: `${dayHeight}px` }}
                      >
                        {mode === "time" ? (
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
                                      label: segment.label,
                                      value: segment.seconds,
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
                        ) : (
                          <div
                            onMouseEnter={() =>
                              setHoveredSegment({
                                key: `${day.date}-opens`,
                                label: formatDay(day.date),
                                value: day.openCount,
                                x: index * (barMetrics.width + barMetrics.gap),
                                top: CHART_HEIGHT - dayHeight,
                              })
                            }
                            onMouseLeave={() =>
                              setHoveredSegment((current) =>
                                current?.key === `${day.date}-opens` ? null : current,
                              )
                            }
                            className="h-full w-full transition-opacity duration-150"
                            style={{ backgroundColor: OPEN_BAR_COLOR }}
                          />
                        )}
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

function BreakdownPanel({
  selectedDay,
  rangeAverage,
  rangeMode,
  onReset,
}: {
  selectedDay: UsageChartDay | null;
  rangeAverage: UsageHistoryPayload["rangeAverage"];
  rangeMode: UsageHistoryRangeMode;
  onReset: () => void;
}) {
  const isSelectedDay = selectedDay != null;
  const title = isSelectedDay
    ? formatDay(selectedDay.date)
    : rangeMode === "overall"
    ? "Overall average"
    : "Recent range average";
  const totalSeconds = isSelectedDay ? selectedDay.usageSeconds : rangeAverage.averageSeconds;
  const openCount = isSelectedDay ? selectedDay.openCount : rangeAverage.averageOpens;
  const feedSegments = isSelectedDay ? selectedDay.feedSegments : rangeAverage.feedSegments;
  const subredditSegments = isSelectedDay
    ? selectedDay.subredditSegments
    : rangeAverage.subredditSegments;
  const feedDescription = isSelectedDay
    ? "Small chart slices roll into Other, but every tracked feed for this day is listed here."
    : rangeAverage.dayCount > 0
    ? `Per-feed averages use the same ${rangeAverage.dayCount} completed tracked day${
        rangeAverage.dayCount === 1 ? "" : "s"
      } as the total, so the rows add back up.`
    : "Finish at least one tracked day to see a range-wide average breakdown.";
  const subredditDescription = isSelectedDay
    ? null
    : rangeAverage.dayCount > 0
    ? `Average time per completed tracked day across the current ${rangeMode} range.`
    : null;

  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{isSelectedDay ? "Selected day" : "Breakdown basis"}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-2xl font-semibold text-white">{title}</h3>
            <p className="text-lg font-semibold text-teal-300">{formatDurationCompact(totalSeconds)}</p>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500">
              {formatOpenCount(openCount)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!isSelectedDay}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isSelectedDay
              ? "border border-gray-700 bg-gray-950 text-gray-200 hover:border-gray-600 hover:bg-gray-900"
              : "cursor-default border border-gray-800 bg-gray-950/50 text-gray-500"
          }`}
        >
          {isSelectedDay ? "Reset" : "Showing average"}
        </button>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">
          Feed breakdown
        </h4>
        <p className="mt-2 text-sm text-gray-500">{feedDescription}</p>
        <div className="mt-4 space-y-3">
          {feedSegments.length === 0 ? (
            <p className="text-sm text-gray-500">
              {isSelectedDay
                ? "No tracked feed activity for this day."
                : "No range-wide feed averages yet."}
            </p>
          ) : (
            feedSegments.map((segment) => (
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
                      width: `${totalSeconds ? (segment.seconds / totalSeconds) * 100 : 0}%`,
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
        {subredditDescription ? <p className="mt-2 text-sm text-gray-500">{subredditDescription}</p> : null}
        <div className="mt-4 space-y-3">
          {subredditSegments.length === 0 ? (
            <p className="text-sm text-gray-500">
              {isSelectedDay
                ? "No subreddit-specific data was captured for this day. Mixed feed browsing is still counted toward feed totals."
                : "No subreddit-level range averages yet. Mixed feed browsing still counts toward the feed averages above."}
            </p>
          ) : (
            subredditSegments.slice(0, 8).map((segment) => (
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
