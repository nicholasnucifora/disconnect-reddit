export const DEFAULT_TIMEZONE = "Australia/Brisbane";
export const USAGE_UI_BUFFER_SECONDS = 5;
export const USAGE_FLUSH_INTERVAL_MS = 15_000;
export const USAGE_STATUS_REFRESH_MS = 30_000;

export interface UsageSettingsRow {
  username: string;
  timezone: string;
  daily_limit_seconds: number | null;
  daily_usage_seconds: number;
  daily_reset_at: string;
  count_visible_without_focus: boolean;
}

export interface UsageScheduleRow {
  id: string;
  username: string;
  name: string;
  days: number[];
  all_day: boolean;
  banned: boolean;
  daily_allowance_seconds: number | null;
  priority: number | null;
  created_at?: string;
}

export interface UsageScheduleWindowRow {
  id: string;
  schedule_id: string;
  start_time: string;
  end_time: string;
}

export interface UsageEventRow {
  username: string;
  occurred_at: string;
  usage_date: string;
  seconds: number;
  feed_id: string;
  feed_name: string;
  subreddit: string | null;
}

export interface UsageWindowStatus {
  id: string;
  start_time: string;
  end_time: string;
  status: "active" | "upcoming" | "ended";
}

export interface UsageScheduleWithWindows extends UsageScheduleRow {
  windows: UsageScheduleWindowRow[];
}

export interface UsageStatusPayload {
  now: string;
  todayKey: string;
  timezone: string;
  countVisibleWithoutFocus: boolean;
  dailyUsageSeconds: number;
  globalDailyLimitSeconds: number | null;
  effectiveDailyLimitSeconds: number | null;
  remainingSeconds: number | null;
  dailyResetAt: string;
  isBlockedBySchedule: boolean;
  isLimitReached: boolean;
  restrictionReason: "schedule_blocked" | "limit_reached" | null;
  currentSchedule: UsageScheduleWithWindows | null;
  todayWindows: UsageWindowStatus[];
  hasScheduleToday: boolean;
  isWithinWindow: boolean;
  nextWindowOpensAt: string | null;
}

export interface UsageTrackEntryInput {
  seconds: number;
  feedId: string;
  feedName: string;
  subreddit?: string | null;
}

export interface UsageChartDay {
  date: string;
  usageSeconds: number;
  limitSeconds: number | null;
  feedSegments: Array<{
    feedId: string;
    feedName: string;
    seconds: number;
  }>;
  subredditSegments: Array<{
    subreddit: string;
    seconds: number;
    feedId: string;
    feedName: string;
  }>;
}

export interface UsageHistoryPayload {
  rangeDays: number;
  resetAt: string;
  stats: {
    totalSeconds: number;
    activeDays: number;
    averageSeconds: number;
  };
  today: UsageStatusPayload;
  chart: UsageChartDay[];
}

export interface UsageSettingsPayload {
  timezone: string;
  dailyLimitSeconds: number | null;
  countVisibleWithoutFocus: boolean;
  schedules: UsageScheduleWithWindows[];
}
