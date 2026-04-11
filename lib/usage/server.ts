import { createClient } from "@/lib/supabase/server";
import { USERNAME } from "@/lib/config";
import {
  DEFAULT_TIMEZONE,
  USAGE_UI_BUFFER_SECONDS,
  type UsageChartDay,
  type UsageEventRow,
  type UsageFeedBreakdownSegment,
  type UsageHistoryPayload,
  type UsageHistoryRangeMode,
  type UsageScheduleRow,
  type UsageScheduleWindowRow,
  type UsageScheduleWithWindows,
  type UsageSettingsRow,
  type UsageSettingsPayload,
  type UsageStatusPayload,
  type UsageSubredditBreakdownSegment,
  type UsageTrackEntryInput,
  type UsageWindowStatus,
} from "./types";
import {
  getLocalDateKey,
  getLocalTimeSeconds,
  getNextLocalMidnight,
  getZonedParts,
  normalizeTimeZone,
  parseClockTimeToSeconds,
  zonedTimeToUtc,
} from "./time";

type ScheduleCandidate = UsageScheduleWithWindows | null;
const DEFAULT_DAILY_LIMIT_SECONDS = 60 * 60;
const RECENT_HISTORY_DAYS = 30;

function clampSeconds(value: number): number {
  return Math.max(0, Math.min(Math.floor(value), 300));
}

function requireData<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data as T;
}

function ensureDailyLimit(value: number | null | undefined): number {
  return value == null || value <= 0 ? DEFAULT_DAILY_LIMIT_SECONDS : value;
}

async function ensureSettings(now = new Date()): Promise<UsageSettingsRow> {
  const supabase = createClient();
  const result = await supabase
    .from("user_usage_settings")
    .select("username, timezone, daily_limit_seconds, daily_usage_seconds, daily_reset_at")
    .eq("username", USERNAME)
    .maybeSingle();
  if (result.error) {
    throw new Error(`load user_usage_settings: ${result.error.message}`);
  }
  const data = result.data as UsageSettingsRow | null;

  const timezone = normalizeTimeZone((data as UsageSettingsRow | null)?.timezone ?? DEFAULT_TIMEZONE);
  const currentResetAt = data?.daily_reset_at ? new Date(data.daily_reset_at) : null;

  if (!data) {
    const initial: UsageSettingsRow = {
      username: USERNAME,
      timezone,
      daily_limit_seconds: DEFAULT_DAILY_LIMIT_SECONDS,
      daily_usage_seconds: 0,
      daily_reset_at: getNextLocalMidnight(now, timezone).toISOString(),
    };
    const upsertResult = await supabase.from("user_usage_settings").upsert(initial, { onConflict: "username" });
    if (upsertResult.error) {
      throw new Error(`create user_usage_settings: ${upsertResult.error.message}`);
    }
    return initial;
  }

  if (!currentResetAt || now >= currentResetAt) {
    const reset: UsageSettingsRow = {
      username: USERNAME,
      timezone,
      daily_limit_seconds: ensureDailyLimit(data.daily_limit_seconds),
      daily_usage_seconds: 0,
      daily_reset_at: getNextLocalMidnight(now, timezone).toISOString(),
    };
    const updateResult = await supabase
      .from("user_usage_settings")
      .update({
        timezone,
        daily_limit_seconds: reset.daily_limit_seconds,
        daily_usage_seconds: 0,
        daily_reset_at: reset.daily_reset_at,
      })
      .eq("username", USERNAME);
    if (updateResult.error) {
      throw new Error(`reset user_usage_settings: ${updateResult.error.message}`);
    }
    return reset;
  }

  return {
    username: USERNAME,
    timezone,
    daily_limit_seconds: ensureDailyLimit(data.daily_limit_seconds),
    daily_usage_seconds: data.daily_usage_seconds ?? 0,
    daily_reset_at: currentResetAt.toISOString(),
  };
}

async function getSchedules(): Promise<UsageScheduleWithWindows[]> {
  const supabase = createClient();
  const [schedulesResult, windowsResult] = await Promise.all([
    supabase
      .from("usage_schedules")
      .select("id, username, name, days, all_day, banned, daily_allowance_seconds, priority, created_at")
      .eq("username", USERNAME),
    supabase
      .from("usage_schedule_windows")
      .select("id, schedule_id, start_time, end_time"),
  ]);
  const schedulesData = requireData(schedulesResult, "load usage_schedules");
  const windowsData = requireData(windowsResult, "load usage_schedule_windows");

  const windowsBySchedule = new Map<string, UsageScheduleWindowRow[]>();
  (windowsData as UsageScheduleWindowRow[] | null ?? []).forEach((window) => {
    const list = windowsBySchedule.get(window.schedule_id) ?? [];
    list.push(window);
    windowsBySchedule.set(window.schedule_id, list);
  });

  return ((schedulesData as UsageScheduleRow[] | null) ?? [])
    .map((schedule) => ({
      ...schedule,
      days: Array.isArray(schedule.days) ? schedule.days : [],
      windows: (windowsBySchedule.get(schedule.id) ?? []).sort((a, b) =>
        a.start_time.localeCompare(b.start_time),
      ),
    }))
    .sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
}

export async function getUsageSettingsPayload(now = new Date()): Promise<UsageSettingsPayload> {
  const [settings, schedules] = await Promise.all([ensureSettings(now), getSchedules()]);
  return {
    timezone: normalizeTimeZone(settings.timezone),
    dailyLimitSeconds: ensureDailyLimit(settings.daily_limit_seconds),
    schedules,
  };
}

export async function saveUsageSettingsPayload(payload: UsageSettingsPayload, now = new Date()) {
  const supabase = createClient();
  const timezone = normalizeTimeZone(payload.timezone);

  const currentSettings = await ensureSettings(now);
  const nextResetAt = getNextLocalMidnight(now, timezone).toISOString();

  const settingsWrite = await supabase
    .from("user_usage_settings")
    .upsert(
      {
        username: USERNAME,
        timezone,
        daily_limit_seconds: ensureDailyLimit(payload.dailyLimitSeconds),
        daily_usage_seconds: currentSettings.daily_usage_seconds,
        daily_reset_at: nextResetAt,
      },
      { onConflict: "username" },
    );
  if (settingsWrite.error) {
    throw new Error(`save user_usage_settings: ${settingsWrite.error.message}`);
  }

  const deleteSchedules = await supabase.from("usage_schedules").delete().eq("username", USERNAME);
  if (deleteSchedules.error) {
    throw new Error(`delete usage_schedules: ${deleteSchedules.error.message}`);
  }

  if (payload.schedules.length > 0) {
    const scheduleRows = payload.schedules.map((schedule) => ({
      username: USERNAME,
      name: schedule.name,
      days: schedule.days,
      all_day: schedule.all_day,
      banned: schedule.banned,
      daily_allowance_seconds: schedule.daily_allowance_seconds,
      priority: schedule.priority ?? 0,
    }));

    const insertedSchedules = requireData(
      await supabase
      .from("usage_schedules")
      .insert(scheduleRows)
      .select("id"),
      "insert usage_schedules",
    );

    const windowsToInsert =
      insertedSchedules.flatMap((inserted, index) =>
        payload.schedules[index].windows.map((window) => ({
          schedule_id: inserted.id,
          start_time: window.start_time,
          end_time: window.end_time,
        })),
      );

    if (windowsToInsert.length > 0) {
      const insertWindows = await supabase.from("usage_schedule_windows").insert(windowsToInsert);
      if (insertWindows.error) {
        throw new Error(`insert usage_schedule_windows: ${insertWindows.error.message}`);
      }
    }
  }

  return getUsageSettingsPayload(now);
}

function getScheduleForWeekday(
  schedules: UsageScheduleWithWindows[],
  weekday: number,
): ScheduleCandidate {
  return schedules.find((schedule) => schedule.days.includes(weekday)) ?? null;
}

function getWindowStatuses(
  schedule: UsageScheduleWithWindows | null,
  now: Date,
  timeZone: string,
): {
  todayWindows: UsageWindowStatus[];
  isWithinWindow: boolean;
  nextWindowOpensAt: string | null;
} {
  if (!schedule) {
    return { todayWindows: [], isWithinWindow: true, nextWindowOpensAt: null };
  }

  if (schedule.banned) {
    return { todayWindows: [], isWithinWindow: false, nextWindowOpensAt: null };
  }

  if (schedule.all_day) {
    return { todayWindows: [], isWithinWindow: true, nextWindowOpensAt: null };
  }

  const nowSeconds = getLocalTimeSeconds(now, timeZone);
  const todayKey = getLocalDateKey(now, timeZone);

  let isWithinWindow = false;
  let nextWindowOpensAt: string | null = null;

  const todayWindows = schedule.windows.map((window) => {
    const startSeconds = parseClockTimeToSeconds(window.start_time);
    const endSeconds = parseClockTimeToSeconds(window.end_time);
    const status =
      nowSeconds >= endSeconds ? "ended" : nowSeconds >= startSeconds ? "active" : "upcoming";

    if (status === "active") {
      isWithinWindow = true;
    }

    if (!nextWindowOpensAt && status === "upcoming") {
      const [year, month, day] = todayKey.split("-").map(Number);
      const [hour, minute, second = "0"] = window.start_time.split(":");
      nextWindowOpensAt = zonedTimeToUtc(
        year,
        month,
        day,
        Number(hour),
        Number(minute),
        Number(second),
        timeZone,
      ).toISOString();
    }

    return {
      id: window.id,
      start_time: window.start_time,
      end_time: window.end_time,
      status,
    } satisfies UsageWindowStatus;
  });

  return {
    todayWindows,
    isWithinWindow,
    nextWindowOpensAt,
  };
}

function buildStatusPayload(
  settings: UsageSettingsRow,
  schedules: UsageScheduleWithWindows[],
  now = new Date(),
): UsageStatusPayload {
  const timezone = normalizeTimeZone(settings.timezone);
  const parts = getZonedParts(now, timezone);
  const currentSchedule = getScheduleForWeekday(schedules, parts.weekday);
  const { todayWindows, isWithinWindow, nextWindowOpensAt } = getWindowStatuses(
    currentSchedule,
    now,
    timezone,
  );

  const hasScheduleToday = !!currentSchedule;
  const isBlockedBySchedule = !!currentSchedule && !isWithinWindow;
  const effectiveDailyLimitSeconds =
    currentSchedule?.daily_allowance_seconds ?? ensureDailyLimit(settings.daily_limit_seconds);
  const remainingSeconds =
    effectiveDailyLimitSeconds == null
      ? null
      : Math.max(0, effectiveDailyLimitSeconds - settings.daily_usage_seconds);
  const isLimitReached =
    effectiveDailyLimitSeconds != null &&
    remainingSeconds != null &&
    remainingSeconds <= USAGE_UI_BUFFER_SECONDS;

  return {
    now: now.toISOString(),
    todayKey: getLocalDateKey(now, timezone),
    timezone,
    dailyUsageSeconds: settings.daily_usage_seconds,
    globalDailyLimitSeconds: ensureDailyLimit(settings.daily_limit_seconds),
    effectiveDailyLimitSeconds,
    remainingSeconds,
    dailyResetAt: settings.daily_reset_at,
    isBlockedBySchedule,
    isLimitReached,
    restrictionReason: isBlockedBySchedule
      ? "schedule_blocked"
      : isLimitReached
      ? "limit_reached"
      : null,
    currentSchedule,
    todayWindows,
    hasScheduleToday,
    isWithinWindow,
    nextWindowOpensAt,
  };
}

export async function getUsageStatus(now = new Date()): Promise<UsageStatusPayload> {
  const [settings, schedules] = await Promise.all([ensureSettings(now), getSchedules()]);
  return buildStatusPayload(settings, schedules, now);
}

export async function trackUsageEntries(
  entries: UsageTrackEntryInput[],
  now = new Date(),
): Promise<UsageStatusPayload> {
  const sanitized = entries
    .map((entry) => ({
      seconds: clampSeconds(entry.seconds),
      feedId: entry.feedId || "home",
      feedName: entry.feedName || "Home Feed",
      subreddit: entry.subreddit?.trim() || null,
    }))
    .filter((entry) => entry.seconds > 0);

  const [settingsBefore, schedules] = await Promise.all([ensureSettings(now), getSchedules()]);
  const statusBefore = buildStatusPayload(settingsBefore, schedules, now);

  if (
    sanitized.length === 0 ||
    statusBefore.isBlockedBySchedule ||
    statusBefore.isLimitReached
  ) {
    return statusBefore;
  }

  const supabase = createClient();
  const timeZone = normalizeTimeZone(settingsBefore.timezone);
  const usageDate = getLocalDateKey(now, timeZone);
  const totalSeconds = sanitized.reduce((sum, entry) => sum + entry.seconds, 0);

  const insertEvents = await supabase.from("reddit_usage_events").insert(
    sanitized.map((entry) => ({
      username: USERNAME,
      occurred_at: now.toISOString(),
      usage_date: usageDate,
      seconds: entry.seconds,
      feed_id: entry.feedId,
      feed_name: entry.feedName,
      subreddit: entry.subreddit,
    })),
  );
  if (insertEvents.error) {
    throw new Error(`insert reddit_usage_events: ${insertEvents.error.message}`);
  }

  const nextDailyUsageSeconds = settingsBefore.daily_usage_seconds + totalSeconds;
  const nextResetAt =
    settingsBefore.daily_reset_at || getNextLocalMidnight(now, timeZone).toISOString();

  const updateUsage = await supabase
    .from("user_usage_settings")
    .update({
      daily_usage_seconds: nextDailyUsageSeconds,
      daily_reset_at: nextResetAt,
      timezone: timeZone,
    })
    .eq("username", USERNAME);
  if (updateUsage.error) {
    throw new Error(`update user_usage_settings usage: ${updateUsage.error.message}`);
  }

  return buildStatusPayload(
    {
      ...settingsBefore,
      daily_usage_seconds: nextDailyUsageSeconds,
      daily_reset_at: nextResetAt,
      timezone: timeZone,
    },
    schedules,
    now,
  );
}

function getLimitForDate(
  dateKey: string,
  schedules: UsageScheduleWithWindows[],
  globalLimit: number | null,
  timeZone: string,
): number | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = getZonedParts(date, timeZone).weekday;
  const schedule = getScheduleForWeekday(schedules, weekday);
  return schedule?.daily_allowance_seconds ?? globalLimit ?? null;
}

function buildDateRange(
  startKey: string,
  totalDays: number,
  timeZone: string,
): string[] {
  const [year, month, day] = startKey.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dates: string[] = [];

  for (let index = 0; index < totalDays; index += 1) {
    dates.push(getLocalDateKey(cursor, timeZone));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getDateSpanDaysInclusive(startKey: string, endKey: string): number {
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const startMs = Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0);
  return Math.max(1, Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);
}

function allocateAverageSeconds<T extends { seconds: number }>(
  segments: T[],
  dayCount: number,
  targetTotal: number,
  getTieKey: (segment: T) => string,
): T[] {
  if (dayCount <= 0 || segments.length === 0 || targetTotal <= 0) return [];

  const withFractions = segments.map((segment) => {
    const rawAverage = segment.seconds / dayCount;
    const baseSeconds = Math.floor(rawAverage);

    return {
      segment,
      baseSeconds,
      fractionalSeconds: rawAverage - baseSeconds,
    };
  });

  let remainingSeconds =
    targetTotal - withFractions.reduce((sum, item) => sum + item.baseSeconds, 0);

  withFractions.sort((left, right) => {
    if (right.fractionalSeconds !== left.fractionalSeconds) {
      return right.fractionalSeconds - left.fractionalSeconds;
    }
    if (right.segment.seconds !== left.segment.seconds) {
      return right.segment.seconds - left.segment.seconds;
    }
    return getTieKey(left.segment).localeCompare(getTieKey(right.segment));
  });

  const allocated = withFractions.map((item) => ({
    ...item.segment,
    seconds: item.baseSeconds,
  }));

  for (let index = 0; index < allocated.length && remainingSeconds > 0; index += 1) {
    allocated[index].seconds += 1;
    remainingSeconds -= 1;
  }

  return allocated
    .filter((segment) => segment.seconds > 0)
    .sort((left, right) => {
      if (right.seconds !== left.seconds) return right.seconds - left.seconds;
      return getTieKey(left).localeCompare(getTieKey(right));
    });
}

function buildRangeAverage(
  chart: UsageChartDay[],
  todayKey: string,
): UsageHistoryPayload["rangeAverage"] {
  const averageDays = chart.filter((day) => day.date !== todayKey && day.usageSeconds > 0);

  if (averageDays.length === 0) {
    return {
      dayCount: 0,
      averageSeconds: 0,
      feedSegments: [],
      subredditSegments: [],
    };
  }

  const totalSeconds = averageDays.reduce((sum, day) => sum + day.usageSeconds, 0);
  const averageSeconds = Math.round(totalSeconds / averageDays.length);
  const feedTotals = new Map<string, UsageFeedBreakdownSegment>();
  const subredditTotals = new Map<string, UsageSubredditBreakdownSegment>();

  for (const day of averageDays) {
    for (const segment of day.feedSegments) {
      const current = feedTotals.get(segment.feedId);
      if (current) {
        current.seconds += segment.seconds;
      } else {
        feedTotals.set(segment.feedId, { ...segment });
      }
    }

    for (const segment of day.subredditSegments) {
      const key = `${segment.feedId}::${segment.subreddit}`;
      const current = subredditTotals.get(key);
      if (current) {
        current.seconds += segment.seconds;
      } else {
        subredditTotals.set(key, { ...segment });
      }
    }
  }

  return {
    dayCount: averageDays.length,
    averageSeconds,
    feedSegments: allocateAverageSeconds(
      Array.from(feedTotals.values()),
      averageDays.length,
      averageSeconds,
      (segment) => `${segment.feedName}:${segment.feedId}`,
    ),
    subredditSegments: allocateAverageSeconds(
      Array.from(subredditTotals.values()),
      averageDays.length,
      averageSeconds,
      (segment) => `${segment.feedName}:${segment.subreddit}:${segment.feedId}`,
    ),
  };
}

export async function getUsageHistory(
  rangeMode: UsageHistoryRangeMode,
  now = new Date(),
): Promise<UsageHistoryPayload> {
  const safeMode: UsageHistoryRangeMode = rangeMode === "overall" ? "overall" : "recent";
  const [settings, schedules] = await Promise.all([ensureSettings(now), getSchedules()]);
  const timeZone = normalizeTimeZone(settings.timezone);
  const todayKey = getLocalDateKey(now, timeZone);

  const supabase = createClient();
  const firstTrackedResult = await supabase
    .from("reddit_usage_events")
    .select("usage_date")
    .eq("username", USERNAME)
    .order("usage_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstTrackedResult.error) {
    throw new Error(`load first tracked usage date: ${firstTrackedResult.error.message}`);
  }

  const firstTrackedDate = firstTrackedResult.data?.usage_date ?? null;
  const recentStartDate = new Date(now.getTime() - (RECENT_HISTORY_DAYS - 1) * 24 * 60 * 60 * 1000);
  const recentStartKey = getLocalDateKey(recentStartDate, timeZone);
  const startKey =
    firstTrackedDate == null
      ? null
      : safeMode === "overall"
      ? firstTrackedDate
      : firstTrackedDate > recentStartKey
      ? firstTrackedDate
      : recentStartKey;
  const eventsResult =
    startKey == null
      ? { data: [] as UsageEventRow[] | null, error: null }
      : await supabase
          .from("reddit_usage_events")
          .select("username, occurred_at, usage_date, seconds, feed_id, feed_name, subreddit")
          .eq("username", USERNAME)
          .gte("usage_date", startKey)
          .order("usage_date", { ascending: true });

  if (eventsResult.error) {
    throw new Error(`load reddit_usage_events: ${eventsResult.error.message}`);
  }

  const events = (eventsResult.data as UsageEventRow[] | null) ?? [];
  const chartMap = new Map<string, UsageChartDay>();

  for (const event of events) {
    const day = chartMap.get(event.usage_date) ?? {
      date: event.usage_date,
      usageSeconds: 0,
      limitSeconds: getLimitForDate(event.usage_date, schedules, ensureDailyLimit(settings.daily_limit_seconds), timeZone),
      feedSegments: [],
      subredditSegments: [],
    };

    day.usageSeconds += event.seconds;

    const existingFeed = day.feedSegments.find((segment) => segment.feedId === event.feed_id);
    if (existingFeed) {
      existingFeed.seconds += event.seconds;
    } else {
      day.feedSegments.push({
        feedId: event.feed_id,
        feedName: event.feed_name,
        seconds: event.seconds,
      });
    }

    if (event.subreddit) {
      const existingSubreddit = day.subredditSegments.find(
        (segment) => segment.subreddit === event.subreddit && segment.feedId === event.feed_id,
      );
      if (existingSubreddit) {
        existingSubreddit.seconds += event.seconds;
      } else {
        day.subredditSegments.push({
          subreddit: event.subreddit,
          seconds: event.seconds,
          feedId: event.feed_id,
          feedName: event.feed_name,
        });
      }
    }

    chartMap.set(event.usage_date, day);
  }

  const chart =
    startKey == null
      ? []
      : buildDateRange(
          startKey,
          getDateSpanDaysInclusive(startKey, todayKey),
          timeZone,
        ).map((dateKey) => {
    const existingDay = chartMap.get(dateKey);

    if (!existingDay) {
      return {
        date: dateKey,
        usageSeconds: 0,
        limitSeconds: getLimitForDate(
          dateKey,
          schedules,
          ensureDailyLimit(settings.daily_limit_seconds),
          timeZone,
        ),
        feedSegments: [],
        subredditSegments: [],
      } satisfies UsageChartDay;
    }

    return {
      ...existingDay,
      feedSegments: existingDay.feedSegments.sort((a, b) => b.seconds - a.seconds),
      subredditSegments: existingDay.subredditSegments.sort((a, b) => b.seconds - a.seconds),
    };
  });

  const totalSeconds = chart.reduce((sum, day) => sum + day.usageSeconds, 0);
  const activeDays = chart.filter((day) => day.usageSeconds > 0).length;
  const rangeAverage = buildRangeAverage(chart, todayKey);

  return {
    rangeMode: safeMode,
    trackedSince: firstTrackedDate,
    resetAt: settings.daily_reset_at,
    stats: {
      totalSeconds,
      activeDays,
      averageDayCount: rangeAverage.dayCount,
      averageSeconds: rangeAverage.averageSeconds,
    },
    rangeAverage,
    today: buildStatusPayload(settings, schedules, now),
    chart,
  };
}
