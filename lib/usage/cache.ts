"use client";

import type { UsageStatusPayload } from "./types";

const USAGE_CACHE_KEY = "disconnect_reddit_usage_status_v1";

export function getCachedUsageStatus(): UsageStatusPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USAGE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UsageStatusPayload) : null;
  } catch {
    return null;
  }
}

export function setCachedUsageStatus(value: UsageStatusPayload | null) {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      localStorage.removeItem(USAGE_CACHE_KEY);
      return;
    }
    localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}
