"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { USERNAME } from "@/lib/config";
import { clearAllCachedPostCollections } from "@/lib/post-feed-cache";
import {
  DEFAULT_SUBREDDIT_MAX_POSTS,
  DEFAULT_SUBREDDIT_MIN_COMMENTS,
  normalizeSubreddit,
  sanitizeSubredditMaxPosts,
  sanitizeSubredditMinComments,
} from "@/lib/subreddit-rules";
import { useSubreddits } from "@/lib/subreddits-context";
import { createClient } from "@/lib/supabase/client";
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

function toCountLimit(value: number | null) {
  if (value == null) return "";
  return String(Math.floor(value));
}

function fromCountLimit(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
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
    daily_open_limit: null,
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
  const { subreddits, ready: subredditsReady } = useSubreddits();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [subredditRulesReady, setSubredditRulesReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Australia/Brisbane");
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState("60");
  const [dailyOpenLimit, setDailyOpenLimit] = useState("");
  const [countFocusReturnAsOpen, setCountFocusReturnAsOpen] = useState(false);
  const [schedules, setSchedules] = useState<UsageScheduleWithWindows[]>([]);
  const [subredditRules, setSubredditRules] = useState<
    Record<string, { maxPosts: string; minComments: string }>
  >({});

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
        setDailyOpenLimit(toCountLimit(payload.dailyOpenLimit));
        setCountFocusReturnAsOpen(payload.countFocusReturnAsOpen === true);
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

  useEffect(() => {
    if (!subredditsReady) return;

    let ignore = false;

    async function loadSubredditRules() {
      setSubredditRulesReady(false);

      const { data, error } = await supabase
        .from("user_subreddits")
        .select("subreddit, max_posts, min_comments")
        .eq("username", USERNAME)
        .order("added_at", { ascending: true });

      if (ignore) return;

      if (error) {
        setSubredditRules({});
        setSubredditRulesReady(true);
        return;
      }

      const nextRules = Object.fromEntries(
        subreddits.map((subreddit) => {
          const normalized = normalizeSubreddit(subreddit);
          const row = (data ?? []).find(
            (item: { subreddit: string }) => normalizeSubreddit(item.subreddit) === normalized
          ) as { subreddit: string; max_posts: number | null; min_comments: number | null } | undefined;

          return [
            normalized,
            {
              maxPosts: String(sanitizeSubredditMaxPosts(row?.max_posts)),
              minComments: String(sanitizeSubredditMinComments(row?.min_comments)),
            },
          ] as const;
        })
      );

      setSubredditRules(nextRules);
      setSubredditRulesReady(true);
    }

    void loadSubredditRules();

    return () => {
      ignore = true;
    };
  }, [subreddits, subredditsReady, supabase]);

  function updateSchedule(id: string, updater: (schedule: UsageScheduleWithWindows) => UsageScheduleWithWindows) {
    setSchedules((current) => current.map((schedule) => (schedule.id === id ? updater(schedule) : schedule)));
  }

  function updateSubredditRule(
    subreddit: string,
    field: "maxPosts" | "minComments",
    value: string
  ) {
    const normalized = normalizeSubreddit(subreddit);
    setSubredditRules((current) => ({
      ...current,
      [normalized]: {
        maxPosts: current[normalized]?.maxPosts ?? String(DEFAULT_SUBREDDIT_MAX_POSTS),
        minComments: current[normalized]?.minComments ?? String(DEFAULT_SUBREDDIT_MIN_COMMENTS),
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const payload: UsageSettingsPayload = {
        timezone,
        dailyLimitSeconds: fromMinutes(dailyLimitMinutes) ?? 3600,
        dailyOpenLimit: fromCountLimit(dailyOpenLimit),
        countFocusReturnAsOpen,
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
      const subredditPayload = subreddits.map((subreddit) => {
        const normalized = normalizeSubreddit(subreddit);
        const current = subredditRules[normalized];

        return {
          username: USERNAME,
          subreddit: normalized,
          max_posts: sanitizeSubredditMaxPosts(
            current?.maxPosts === "" ? null : Number(current?.maxPosts)
          ),
          min_comments: sanitizeSubredditMinComments(
            current?.minComments === "" ? null : Number(current?.minComments)
          ),
        };
      });

      let subredditError: Error | null = null;
      if (subredditPayload.length > 0) {
        const results = await Promise.all(
          subredditPayload.map((entry) =>
            supabase
              .from("user_subreddits")
              .update({
                max_posts: entry.max_posts,
                min_comments: entry.min_comments,
              })
              .eq("username", entry.username)
              .eq("subreddit", entry.subreddit)
          )
        );
        subredditError = results.find((result) => result.error)?.error ?? null;
      }

      if (subredditError) {
        throw new Error(subredditError.message);
      }

      setTimezone(saved.timezone);
      setDailyLimitMinutes(toMinutes(saved.dailyLimitSeconds) || "60");
      setDailyOpenLimit(toCountLimit(saved.dailyOpenLimit));
      setCountFocusReturnAsOpen(saved.countFocusReturnAsOpen === true);
      setSchedules(saved.schedules);
      setSubredditRules(
        Object.fromEntries(
          subredditPayload.map((entry) => [
            entry.subreddit,
            {
              maxPosts: String(entry.max_posts),
              minComments: String(entry.min_comments),
            },
          ])
        )
      );

      let invalidationWarning = false;
      try {
        const invalidateResponse = await fetch("/api/reddit/precompute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clearAll" }),
        });

        if (!invalidateResponse.ok) {
          invalidationWarning = true;
        }
      } catch {
        invalidationWarning = true;
      }

      clearAllCachedPostCollections();
      await refreshStatus();
      setMessage(
        invalidationWarning
          ? "Saved. Feed snapshots were not cleared automatically."
          : "Saved."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
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

        {loading || !subredditsReady || !subredditRulesReady ? (
          <div className="mt-10 flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Daily limit</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
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

                <div>
                  <span className="text-sm text-gray-400">Daily open limit</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={dailyOpenLimit}
                      onChange={(event) => setDailyOpenLimit(event.target.value)}
                      className="w-40 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white disabled:opacity-50"
                      placeholder="Unlimited"
                    />
                    <span className="text-sm text-gray-500">opens</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Leave blank to avoid blocking new opens.</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={countFocusReturnAsOpen}
                    onChange={(event) => setCountFocusReturnAsOpen(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-950 text-teal-400 focus:ring-teal-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-white">
                      Count returning to focus as an open
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
                      Off by default. When enabled, every desktop blur-to-focus return counts as a new open,
                      which gives open limits more leverage for people who keep the site sitting in a tab all day.
                    </p>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500">
                      This is less intuitive than normal open counting because clicking away and then back can add
                      another open even if the tab was never closed.
                    </p>
                  </div>
                </label>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Subreddit fetch rules</h2>
                  <p className="mt-1 max-w-3xl text-sm text-gray-400">
                    Tune how many posts are pulled per subreddit before feeds are merged, and require a minimum
                    comment count before a post can appear.
                  </p>
                </div>
              </div>

              {subreddits.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-gray-700 p-8 text-center text-sm text-gray-500">
                  Add some subreddits first, then you can tune their fetch limits here.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {subreddits.map((subreddit) => {
                    const normalized = normalizeSubreddit(subreddit);
                    const current = subredditRules[normalized] ?? {
                      maxPosts: String(DEFAULT_SUBREDDIT_MAX_POSTS),
                      minComments: String(DEFAULT_SUBREDDIT_MIN_COMMENTS),
                    };

                    return (
                      <div
                        key={normalized}
                        className="grid gap-4 rounded-2xl border border-gray-800 bg-gray-950/70 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
                      >
                        <div>
                          <p className="text-sm font-medium text-white">r/{subreddit}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Higher max-post values fetch more candidates. Higher comment minimums filter more aggressively.
                          </p>
                        </div>

                        <label className="block">
                          <span className="text-sm text-gray-400">Max posts fetched</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={current.maxPosts}
                            onChange={(event) => updateSubredditRule(subreddit, "maxPosts", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                            placeholder="100"
                          />
                        </label>

                        <label className="block">
                          <span className="text-sm text-gray-400">Minimum comments</span>
                          <input
                            type="number"
                            min="0"
                            value={current.minComments}
                            onChange={(event) => updateSubredditRule(subreddit, "minComments", event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                            placeholder="0"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-200">Why there is no upvote filter</p>
                <p className="mt-2 text-sm leading-6 text-amber-100/80">
                  Reddit scores are noisy and often lag or get fuzzed by the source this app reads from. Comment counts
                  are much more reliable here because the app can refresh them per post before ranking. An upvote
                  threshold would hide and unhide posts inconsistently, so it is intentionally not offered as a hard
                  filter.
                </p>
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

                      <div className="mt-5 grid gap-5 md:grid-cols-3">
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

                        <label className="block">
                          <span className="text-sm text-gray-400">Override open limit</span>
                          <input
                            type="number"
                            min="1"
                            value={toCountLimit(schedule.daily_open_limit)}
                            onChange={(event) =>
                              updateSchedule(schedule.id, (current) => ({
                                ...current,
                                daily_open_limit: fromCountLimit(event.target.value),
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-teal-500 focus:outline-none"
                            placeholder="Blank = use global open limit"
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
