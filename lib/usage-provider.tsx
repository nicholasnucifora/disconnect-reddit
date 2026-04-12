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
import { useIsMobileViewport } from "@/lib/use-is-mobile-viewport";
import { getCachedUsageStatus, setCachedUsageStatus } from "./usage/cache";
import { getUsageBrowsingContext, type UsageBrowsingContext } from "./usage/context";
import { formatDurationCompact } from "./usage/time";
import {
  USAGE_FLUSH_INTERVAL_MS,
  USAGE_STATUS_REFRESH_MS,
  USAGE_UI_BUFFER_SECONDS,
  type UsageStatusPayload,
} from "./usage/types";

const USAGE_SESSION_KEY = "disconnect_reddit_usage_session_id_v1";

interface UsageContextValue {
  status: UsageStatusPayload | null;
  ready: boolean;
  isRefreshing: boolean;
  isBlocked: boolean;
  isLimitReached: boolean;
  isOpenLimitReached: boolean;
  canBrowse: boolean;
  headerLabel: string | null;
  headerSecondaryLabel: string | null;
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

function withOptimisticOpenAttempt(localStatus: UsageStatusPayload | null) {
  if (!localStatus) return null;
  if (localStatus.isOpenLimitReached) return localStatus;

  const openLimit = localStatus.dailyOpenLimit;

  if (openLimit != null && localStatus.dailyOpenCount >= openLimit) {
    return {
      ...localStatus,
      isOpenLimitReached: true,
      restrictionReason: localStatus.isBlockedBySchedule
        ? ("schedule_blocked" as const)
        : ("open_limit_reached" as const),
    };
  }

  const nextDailyOpenCount = localStatus.dailyOpenCount + 1;
  const remainingOpens = openLimit == null ? null : Math.max(0, openLimit - nextDailyOpenCount);

  return {
    ...localStatus,
    dailyOpenCount: nextDailyOpenCount,
    remainingOpens,
  };
}

function getUsageSessionId() {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(USAGE_SESSION_KEY);
    if (existing) return existing;

    const nextId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(USAGE_SESSION_KEY, nextId);
    return nextId;
  } catch {
    return null;
  }
}

function getFocusReturnSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `focus-${crypto.randomUUID()}`;
  }

  return `focus-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { feeds, activeFeedId, subredditFeedMap } = useFeeds();
  const isMobileViewport = useIsMobileViewport();

  const [status, setStatus] = useState<UsageStatusPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusRef = useRef<UsageStatusPayload | null>(status);
  const shouldTrackRef = useRef(false);
  const pendingEntriesRef = useRef<Map<string, { seconds: number; context: UsageBrowsingContext }>>(new Map());
  const currentContextRef = useRef<UsageBrowsingContext | null>(null);
  const inflightFlushRef = useRef<Promise<void> | null>(null);
  const focusedRef = useRef(true);
  const hasLostFocusRef = useRef(false);

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

  const updateShouldTrack = useCallback(() => {
    const activeStatus = statusRef.current;
    const activeContext = currentContextRef.current;

    shouldTrackRef.current =
      !!activeStatus &&
      !!activeContext &&
      document.visibilityState === "visible" &&
      (isMobileViewport || focusedRef.current) &&
      !activeStatus.isBlockedBySchedule &&
      !activeStatus.isOpenLimitReached &&
      !activeStatus.isLimitReached;
  }, [isMobileViewport]);

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

  const registerOpen = useCallback(async (sessionIdOverride?: string, options?: { optimistic?: boolean }) => {
    const sessionId = sessionIdOverride ?? getUsageSessionId();
    if (!sessionId) {
      await refreshStatus();
      return;
    }

    if (options?.optimistic) {
      mergeStatus(withOptimisticOpenAttempt(statusRef.current));
    }

    setIsRefreshing(true);
    try {
      const response = await fetch("/api/usage/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to register app open");
      const nextStatus = (await response.json()) as UsageStatusPayload;
      mergeStatus(withLocalUsageFloor(nextStatus, statusRef.current));
    } catch {
      setReady((prev) => prev || !!statusRef.current);
      await refreshStatus();
    } finally {
      setIsRefreshing(false);
    }
  }, [mergeStatus, refreshStatus]);

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
    void registerOpen();
    const interval = window.setInterval(() => void refreshStatus(), USAGE_STATUS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshStatus, registerOpen]);

  useEffect(() => {
    currentContextRef.current = currentContext;
    updateShouldTrack();
  }, [currentContext, updateShouldTrack]);

  useEffect(() => {
    const handleFocus = () => {
      focusedRef.current = true;
      updateShouldTrack();
      if (
        hasLostFocusRef.current &&
        !isMobileViewport &&
        statusRef.current?.countFocusReturnAsOpen
      ) {
        hasLostFocusRef.current = false;
        void registerOpen(getFocusReturnSessionId(), { optimistic: true });
        return;
      }

      hasLostFocusRef.current = false;
    };
    const handleBlur = () => {
      focusedRef.current = false;
      hasLostFocusRef.current = true;
      updateShouldTrack();
      void flushPending(true);
    };
    const handleVisibility = () => {
      updateShouldTrack();
      if (document.visibilityState !== "visible") void flushPending(true);
    };
    const handlePageHide = () => {
      updateShouldTrack();
      void flushPending(true);
    };

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
  }, [flushPending, isMobileViewport, registerOpen, updateShouldTrack]);

  useEffect(() => {
    updateShouldTrack();
  }, [status, currentContext, isMobileViewport, updateShouldTrack]);

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
    const isBlocked = !!status?.isBlockedBySchedule || !!status?.isOpenLimitReached;
    const isLimitReached = !!status?.isLimitReached;
    const isOpenLimitReached = !!status?.isOpenLimitReached;
    const canBrowse = !!status && !isBlocked && !isLimitReached;
    const progressPercent =
      status?.effectiveDailyLimitSeconds && status.effectiveDailyLimitSeconds > 0
        ? Math.min(100, (status.dailyUsageSeconds / status.effectiveDailyLimitSeconds) * 100)
        : 0;

    let headerLabel: string | null = null;
    let headerSecondaryLabel: string | null = null;
    let headerTone: "neutral" | "warning" | "danger" = "neutral";

    if (status) {
      const remainingOpensLabel =
        status.remainingOpens == null
          ? null
          : `${status.remainingOpens} open${status.remainingOpens === 1 ? "" : "s"} left`;

      if (status.isBlockedBySchedule) {
        headerLabel = "Blocked";
        headerTone = "danger";
      } else if (status.isOpenLimitReached) {
        headerLabel = "Open limit reached";
        headerTone = "danger";
      } else if (isLimitReached) {
        headerLabel = "Limit reached";
        headerTone = "danger";
      } else if (status.remainingSeconds != null) {
        headerLabel = `${formatDurationCompact(status.remainingSeconds)} left`;
        headerSecondaryLabel = remainingOpensLabel;
        headerTone =
          status.remainingOpens != null && status.remainingOpens <= 1
            ? "danger"
            : status.remainingSeconds < 15 * 60 || (status.remainingOpens != null && status.remainingOpens <= 2)
            ? "warning"
            : "neutral";
      } else if (remainingOpensLabel) {
        headerLabel = remainingOpensLabel;
        headerTone =
          status.remainingOpens != null && status.remainingOpens <= 1
            ? "danger"
            : status.remainingOpens != null && status.remainingOpens <= 2
            ? "warning"
            : "neutral";
      }
    }

    return {
      status,
      ready,
      isRefreshing,
      isBlocked,
      isLimitReached,
      isOpenLimitReached,
      canBrowse,
      headerLabel,
      headerSecondaryLabel,
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
