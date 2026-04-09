"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUsage } from "@/lib/usage-provider";
import type { UsageScheduleWithWindows, UsageSettingsPayload } from "@/lib/usage/types";

const WEEKDAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const;

function toMinutes(seconds: number | null) {
  if (seconds == null) return "";
  return String(Math.floor(seconds / 60));
}

function fromMinutes(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 60);
}

function normalizeTime(value: string) {
  if (!value) return "09:00:00";
  return value.length === 5 ? `${value}:00` : value;
}

function makeSchedule(index: number): UsageScheduleWithWindows {
  return {
    id: `draft-${Date.now()}-${index}`,
    username: "global",
    name: `Schedule ${index + 1}`,
    days: [],
    all_day: false,
    banned: false,
    daily_allowance_seconds: null,
    priority: index,
    windows: [
      {
        id: `draft-window-${Date.now()}-${index}`,
        schedule_id: "",
        start_time: "09:00:00",
        end_time: "17:00:00",
      },
    ],
  };
}

export default function UsageSettingsClient() {
  const { refreshStatus } = useUsage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Australia/Brisbane");
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState("60");
  const [schedules, setSchedules] = useState<UsageScheduleWithWindows[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/usage/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load settings");
        const payload = (await response.json()) as UsageSettingsPayload;
        if (ignore) return;
        setTimezone(payload.timezone);
        setDailyLimitMinutes(toMinutes(payload.dailyLimitSeconds) || "60");
        setSchedules(payload.schedules);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  function updateSchedule(id: string, updater: (schedule: UsageScheduleWithWindows) => UsageScheduleWithWindows) {
    setSchedules((current) => current.map((schedule) => (schedule.id === id ? updater(schedule) : schedule)));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const payload: UsageSettingsPayload = {
        timezone,
        dailyLimitSeconds: fromMinutes(dailyLimitMinutes) ?? 3600,
        schedules: schedules.map((schedule, index) => ({
          ...schedule,
          priority: schedules.length - index,
        })),
      };

      const response = await fetch("/api/usage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      const saved = (await response.json()) as UsageSettingsPayload;
      setTimezone(saved.timezone);
      setDailyLimitMinutes(toMinutes(saved.dailyLimitSeconds) || "60");
      setSchedules(saved.schedules);
      await refreshStatus();
      setMessage("Saved.");
    } catch {
      setMessage("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Global settings
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
              Configure one app-wide Reddit timer, timezone, and optional schedules.
            </p>
          </div>
          <Link
            href="/watch-time"
            className="inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-white"
          >
            Open watch time
          </Link>
        </div>

        {loading ? (
          <div className="mt-10 flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Daily limit</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm text-gray-400">Timezone</span>
                  <input
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                    placeholder="Australia/Brisbane"
                  />
                </label>

                <div>
                  <span className="text-sm text-gray-400">Daily allowance</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={dailyLimitMinutes}
                      onChange={(event) => setDailyLimitMinutes(event.target.value)}
                      className="w-40 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white disabled:opacity-50"
                      placeholder="60"
                    />
                    <span className="text-sm text-gray-500">minutes</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Schedules</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Each schedule can allow all day, custom windows, or ban that day entirely.
                  </p>
                </div>
                <button
                  onClick={() => setSchedules((current) => [...current, makeSchedule(current.length)])}
                  className="rounded-full bg-teal-400 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-teal-300"
                >
                  Add schedule
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {schedules.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-700 p-8 text-center text-sm text-gray-500">
                    No schedules yet. Add one if you want certain days or hours restricted.
                  </div>
                )}

                {schedules.map((schedule, index) => {
                  const mode = schedule.banned ? "banned" : schedule.all_day ? "all_day" : "custom";

                  return (
                    <div key={schedule.id} className="rounded-3xl border border-gray-800 bg-gray-950/70 p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex-1">
                          <label className="block">
                            <span className="text-sm text-gray-400">Name</span>
                            <input
                              value={schedule.name}
                              onChange={(event) =>
                                updateSchedule(schedule.id, (current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                            />
                          </label>
                        </div>
                        <button
                          onClick={() => setSchedules((current) => current.filter((item) => item.id !== schedule.id))}
                          className="rounded-full border border-red-500/30 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-5">
                        <span className="text-sm text-gray-400">Days</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {WEEKDAYS.map((day) => {
                            const active = schedule.days.includes(day.value);
                            return (
                              <button
                                key={day.value}
                                onClick={() =>
                                  updateSchedule(schedule.id, (current) => ({
                                    ...current,
                                    days: active
                                      ? current.days.filter((value) => value !== day.value)
                                      : [...current.days, day.value].sort((a, b) => a - b),
                                  }))
                                }
                                className={`rounded-full px-3 py-2 text-sm transition-colors ${
                                  active ? "bg-teal-400 text-gray-950" : "bg-gray-900 text-gray-300 hover:bg-gray-800"
                                }`}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-5 md:grid-cols-2">
                        <label className="block">
                          <span className="text-sm text-gray-400">Mode</span>
                          <select
                            value={mode}
                            onChange={(event) =>
                              updateSchedule(schedule.id, (current) => ({
                                ...current,
                                banned: event.target.value === "banned",
                                all_day: event.target.value === "all_day",
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                          >
                            <option value="custom">Custom windows</option>
                            <option value="all_day">All day</option>
                            <option value="banned">Banned all day</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-sm text-gray-400">Override allowance</span>
                          <input
                            type="number"
                            min="1"
                            value={toMinutes(schedule.daily_allowance_seconds)}
                            onChange={(event) =>
                              updateSchedule(schedule.id, (current) => ({
                                ...current,
                                daily_allowance_seconds: fromMinutes(event.target.value),
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                            placeholder="Blank = use global daily limit"
                          />
                        </label>
                      </div>

                      {mode === "custom" && (
                        <div className="mt-5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-gray-400">Time windows</span>
                            <button
                              onClick={() =>
                                updateSchedule(schedule.id, (current) => ({
                                  ...current,
                                  windows: [
                                    ...current.windows,
                                    {
                                      id: `draft-window-${schedule.id}-${current.windows.length}`,
                                      schedule_id: "",
                                      start_time: "09:00:00",
                                      end_time: "17:00:00",
                                    },
                                  ],
                                }))
                              }
                              className="rounded-full border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-900"
                            >
                              Add window
                            </button>
                          </div>

                          <div className="mt-3 space-y-3">
                            {schedule.windows.map((window) => (
                              <div key={window.id} className="grid gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:grid-cols-[1fr_1fr_auto]">
                                <input
                                  type="time"
                                  value={window.start_time.slice(0, 5)}
                                  onChange={(event) =>
                                    updateSchedule(schedule.id, (current) => ({
                                      ...current,
                                      windows: current.windows.map((item) =>
                                        item.id === window.id
                                          ? { ...item, start_time: normalizeTime(event.target.value) }
                                          : item,
                                      ),
                                    }))
                                  }
                                  className="rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white"
                                />
                                <input
                                  type="time"
                                  value={window.end_time.slice(0, 5)}
                                  onChange={(event) =>
                                    updateSchedule(schedule.id, (current) => ({
                                      ...current,
                                      windows: current.windows.map((item) =>
                                        item.id === window.id
                                          ? { ...item, end_time: normalizeTime(event.target.value) }
                                          : item,
                                      ),
                                    }))
                                  }
                                  className="rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white"
                                />
                                <button
                                  onClick={() =>
                                    updateSchedule(schedule.id, (current) => ({
                                      ...current,
                                      windows: current.windows.filter((item) => item.id !== window.id),
                                    }))
                                  }
                                  className="rounded-2xl border border-red-500/30 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="mt-4 text-xs text-gray-500">
                        Schedule {index + 1} is used on any selected day. If multiple schedules match the same day, higher entries save with higher priority.
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-teal-400 px-5 py-3 text-sm font-medium text-gray-950 transition-colors hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
              {message && <span className="text-sm text-gray-400">{message}</span>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
