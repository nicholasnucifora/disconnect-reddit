export const DEFAULT_TIMEZONE = "Australia/Brisbane";
export const USAGE_UI_BUFFER_SECONDS = 5;
export const USAGE_FLUSH_INTERVAL_MS = 15_000;
export const USAGE_STATUS_REFRESH_MS = 30_000;

export interface UsageSettingsRow {
  username: string;
  timezone: string;
  daily_limit_seconds: number | null;
  daily_usage_seconds: number;
  daily_open_limit: number | null;
  daily_open_count: number;
  daily_reset_at: string;
}

export interface UsageSettingsHistoryRow {
  username: string;
  effective_date: string;
  timezone: string;
  daily_limit_seconds: number | null;
  daily_open_limit: number | null;
  schedules: unknown;
  created_at?: string;
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

export interface UsageOpenEventRow {
  username: string;
  occurred_at: string;
  usage_date: string;
  session_id: string;
}

export interface UsageFeedBreakdownSegment {
  feedId: string;
  feedName: string;
  seconds: number;
}

export interface UsageSubredditBreakdownSegment {
  subreddit: string;
  seconds: number;
  feedId: string;
  feedName: string;
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
  dailyUsageSeconds: number;
  dailyOpenCount: number;
  globalDailyLimitSeconds: number | null;
  effectiveDailyLimitSeconds: number | null;
  remainingSeconds: number | null;
  dailyOpenLimit: number | null;
  remainingOpens: number | null;
  dailyResetAt: string;
  isBlockedBySchedule: boolean;
  isLimitReached: boolean;
  isOpenLimitReached: boolean;
  restrictionReason: "schedule_blocked" | "limit_reached" | "open_limit_reached" | null;
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
  openCount: number;
  limitSeconds: number | null;
  openLimit: number | null;
  feedSegments: UsageFeedBreakdownSegment[];
  subredditSegments: UsageSubredditBreakdownSegment[];
}

export type UsageHistoryRangeMode = "recent" | "overall";

export interface UsageHistoryPayload {
  rangeMode: UsageHistoryRangeMode;
  trackedSince: string | null;
  resetAt: string;
  stats: {
    totalSeconds: number;
    totalOpens: number;
    activeDays: number;
    averageDayCount: number;
    averageSeconds: number;
    averageOpens: number;
  };
  rangeAverage: {
    dayCount: number;
    averageSeconds: number;
    averageOpens: number;
    feedSegments: UsageFeedBreakdownSegment[];
    subredditSegments: UsageSubredditBreakdownSegment[];
  };
  today: UsageStatusPayload;
  chart: UsageChartDay[];
}

export interface UsageSettingsPayload {
  timezone: string;
  dailyLimitSeconds: number | null;
  dailyOpenLimit: number | null;
  schedules: UsageScheduleWithWindows[];
}
