"use client";

import { formatDurationCompact } from "@/lib/usage/time";
import type { UsageStatusPayload } from "@/lib/usage/types";

function formatClock(value: string, timeZone: string) {
  void timeZone;
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

export default function TodayUsageSection({ status }: { status: UsageStatusPayload }) {
  const allowance = status.effectiveDailyLimitSeconds;
  const progress =
    allowance && allowance > 0
      ? Math.min(100, (status.dailyUsageSeconds / allowance) * 100)
      : 0;
  const openSummary =
    status.dailyOpenLimit == null
      ? `${status.dailyOpenCount} opens today`
      : `${status.dailyOpenCount} / ${status.dailyOpenLimit} opens`;

  return (
    <section className="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Today
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {status.hasScheduleToday ? status.currentSchedule?.name : "No schedule today"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            {status.hasScheduleToday
              ? status.currentSchedule?.banned
                ? "This day is fully blocked by schedule."
                : status.currentSchedule?.all_day
                ? "Browsing is allowed all day, subject to the daily allowance."
                : status.isWithinWindow
                ? "You are inside an allowed browsing window right now."
                : status.nextWindowOpensAt
                ? `You are outside the current window. The next one opens at ${new Intl.DateTimeFormat([], {
                    timeZone: status.timezone,
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(status.nextWindowOpensAt))}.`
                : "There are no more allowed browsing windows today."
              : "Access is unrestricted by schedule today, but the global daily limit still applies."}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-950/80 px-4 py-3 text-sm text-gray-300">
          <div className="text-gray-500">Allowance</div>
          <div className="mt-1 font-medium text-white">
            {allowance == null
              ? "Unlimited"
              : `${formatDurationCompact(status.dailyUsageSeconds)} / ${formatDurationCompact(allowance)}`}
          </div>
          <div className="mt-3 text-gray-500">Opens</div>
          <div className="mt-1 font-medium text-white">{openSummary}</div>
          <div className="mt-1 text-xs text-gray-500">
            {status.remainingOpens == null ? "No open cap" : `${status.remainingOpens} opens left today`}
          </div>
        </div>
      </div>

      {status.todayWindows.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {status.todayWindows.map((window) => {
            const tone =
              window.status === "active"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : window.status === "upcoming"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                : "border-gray-800 bg-gray-950/70 text-gray-400";

            return (
              <div key={window.id} className={`rounded-2xl border p-4 ${tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">
                    {formatClock(window.start_time, status.timezone)} to {formatClock(window.end_time, status.timezone)}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em]">
                    {window.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Today&apos;s allowance</span>
          <span>
            {status.remainingSeconds == null
              ? "Unlimited"
              : `${formatDurationCompact(Math.max(status.remainingSeconds, 0))} remaining`}
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status.isBlockedBySchedule || status.isLimitReached
                ? "bg-red-500"
                : progress >= 80
                ? "bg-amber-400"
                : "bg-teal-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <span>Today&apos;s opens</span>
          <span>
            {status.remainingOpens == null
              ? `${status.dailyOpenCount} logged`
              : `${Math.max(status.remainingOpens, 0)} remaining`}
          </span>
        </div>
      </div>
    </section>
  );
}
