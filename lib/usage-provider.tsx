"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useFeeds } from "@/lib/feeds-context";
import { getCachedUsageStatus, setCachedUsageStatus } from "./usage/cache";
import { getUsageBrowsingContext, type UsageBrowsingContext } from "./usage/context";
import { formatDurationCompact } from "./usage/time";
import {
  USAGE_FLUSH_INTERVAL_MS,
  USAGE_STATUS_REFRESH_MS,
  USAGE_UI_BUFFER_SECONDS,
  type UsageStatusPayload,
} from "./usage/types";

interface UsageContextValue {
  status: UsageStatusPayload | null;
  ready: boolean;
  isRefreshing: boolean;
  isBlocked: boolean;
  isLimitReached: boolean;
  canBrowse: boolean;
  headerLabel: string | null;
  headerTone: "neutral" | "warning" | "danger";
  progressPercent: number;
  currentContext: UsageBrowsingContext | null;
  refreshStatus: () => Promise<void>;
}

const UsageContext = createContext<UsageContextValue | null>(null);

function withLocalUsageFloor(nextStatus: UsageStatusPayload, localStatus: UsageStatusPayload | null) {
  if (!localStatus || localStatus.todayKey !== nextStatus.todayKey) return nextStatus;
  if (localStatus.dailyUsageSeconds <= nextStatus.dailyUsageSeconds) return nextStatus;

  const usage = localStatus.dailyUsageSeconds;
  const limit = nextStatus.effectiveDailyLimitSeconds;
  const remaining = limit == null ? null : Math.max(0, limit - usage);
  const isLimitReached = limit != null && remaining != null && remaining <= USAGE_UI_BUFFER_SECONDS;

  return {
    ...nextStatus,
    dailyUsageSeconds: usage,
    remainingSeconds: remaining,
    isLimitReached,
    restrictionReason: nextStatus.isBlockedBySchedule
      ? ("schedule_blocked" as const)
      : isLimitReached
      ? ("limit_reached" as const)
      : null,
  };
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { feeds, activeFeedId, subredditFeedMap } = useFeeds();

  const [status, setStatus] = useState<UsageStatusPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusRef = useRef<UsageStatusPayload | null>(status);
  const shouldTrackRef = useRef(false);
  const pendingEntriesRef = useRef<Map<string, { seconds: number; context: UsageBrowsingContext }>>(new Map());
  const currentContextRef = useRef<UsageBrowsingContext | null>(null);
  const inflightFlushRef = useRef<Promise<void> | null>(null);
  const focusedRef = useRef(true);

  const currentContext = useMemo(
    () =>
      getUsageBrowsingContext({
        pathname,
        feeds,
        activeFeedId,
        subredditFeedMap,
      }),
    [pathname, feeds, activeFeedId, subredditFeedMap],
  );

  const mergeStatus = useCallback((nextStatus: UsageStatusPayload | null) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setCachedUsageStatus(nextStatus);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    const cached = getCachedUsageStatus();
    if (cached) {
      mergeStatus(cached);
      return;
    }
    setReady(true);
  }, [mergeStatus]);

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/usage/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch usage status");
      const nextStatus = (await response.json()) as UsageStatusPayload;
      mergeStatus(withLocalUsageFloor(nextStatus, statusRef.current));
    } catch {
      setReady((prev) => prev || !!statusRef.current);
    } finally {
      setIsRefreshing(false);
    }
  }, [mergeStatus]);

  const flushPending = useCallback(async (useBeacon = false) => {
    if (inflightFlushRef.current) return inflightFlushRef.current;

    const entries = Array.from(pendingEntriesRef.current.values()).map(({ seconds, context }) => ({
      seconds,
      feedId: context.feedId,
      feedName: context.feedName,
      subreddit: context.subreddit ?? null,
    }));
    if (entries.length === 0) return;

    const payload = JSON.stringify({ entries });

    if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        "/api/usage/track",
        new Blob([payload], { type: "application/json" }),
      );
      if (ok) pendingEntriesRef.current.clear();
      return;
    }

    inflightFlushRef.current = fetch("/api/usage/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to persist usage");
        pendingEntriesRef.current.clear();
        mergeStatus((await response.json()) as UsageStatusPayload);
      })
      .catch(() => undefined)
      .finally(() => {
        inflightFlushRef.current = null;
      });

    return inflightFlushRef.current;
  }, [mergeStatus]);

  useEffect(() => {
    void refreshStatus();
    const interval = window.setInterval(() => void refreshStatus(), USAGE_STATUS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    currentContextRef.current = currentContext;
  }, [currentContext]);

  useEffect(() => {
    const handleFocus = () => {
      focusedRef.current = true;
    };
    const handleBlur = () => {
      focusedRef.current = false;
      void flushPending(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") void flushPending(true);
    };
    const handlePageHide = () => void flushPending(true);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushPending]);

  useEffect(() => {
    shouldTrackRef.current =
      !!status &&
      !!currentContext &&
      document.visibilityState === "visible" &&
      focusedRef.current &&
      !status.isBlockedBySchedule &&
      !status.isLimitReached;
  }, [status, currentContext]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!shouldTrackRef.current) return;
      const activeStatus = statusRef.current;
      const activeContext = currentContextRef.current;
      if (!activeStatus || !activeContext) return;

      const key = `${activeContext.feedId}::${activeContext.subreddit ?? ""}`;
      const bucket = pendingEntriesRef.current.get(key);
      pendingEntriesRef.current.set(key, {
        seconds: (bucket?.seconds ?? 0) + 1,
        context: activeContext,
      });

      const limit = activeStatus.effectiveDailyLimitSeconds;
      const nextUsage = activeStatus.dailyUsageSeconds + 1;
      const remaining = limit == null ? null : Math.max(0, limit - nextUsage);
      const isLimitReached = limit != null && remaining != null && remaining <= USAGE_UI_BUFFER_SECONDS;
      const nextStatus: UsageStatusPayload = {
        ...activeStatus,
        dailyUsageSeconds: nextUsage,
        remainingSeconds: remaining,
        isLimitReached,
        restrictionReason: activeStatus.isBlockedBySchedule
          ? ("schedule_blocked" as const)
          : isLimitReached
          ? ("limit_reached" as const)
          : null,
      };

      statusRef.current = nextStatus;
      startTransition(() => {
        setStatus(nextStatus);
        setCachedUsageStatus(nextStatus);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void flushPending(false), USAGE_FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flushPending]);

  const value = useMemo<UsageContextValue>(() => {
    const isBlocked = !!status?.isBlockedBySchedule;
    const isLimitReached = !!status?.isLimitReached;
    const canBrowse = !!status && !isBlocked && !isLimitReached;
    const progressPercent =
      status?.effectiveDailyLimitSeconds && status.effectiveDailyLimitSeconds > 0
        ? Math.min(100, (status.dailyUsageSeconds / status.effectiveDailyLimitSeconds) * 100)
        : 0;

    let headerLabel: string | null = null;
    let headerTone: "neutral" | "warning" | "danger" = "neutral";

    if (status) {
      if (isBlocked) {
        headerLabel = "Blocked";
        headerTone = "danger";
      } else if (isLimitReached) {
        headerLabel = "Limit reached";
        headerTone = "danger";
      } else if (status.remainingSeconds != null) {
        headerLabel = `${formatDurationCompact(status.remainingSeconds)} left`;
        headerTone = status.remainingSeconds < 15 * 60 ? "warning" : "neutral";
      } else {
        headerLabel = "Unlimited";
      }
    }

    return {
      status,
      ready,
      isRefreshing,
      isBlocked,
      isLimitReached,
      canBrowse,
      headerLabel,
      headerTone,
      progressPercent,
      currentContext,
      refreshStatus,
    };
  }, [status, ready, isRefreshing, currentContext, refreshStatus]);

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (!context) throw new Error("useUsage must be used within UsageProvider");
  return context;
}
