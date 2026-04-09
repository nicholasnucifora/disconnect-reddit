import { NextRequest, NextResponse } from "next/server";
import {
  getUsageSettingsPayload,
  saveUsageSettingsPayload,
} from "@/lib/usage/server";
import type { UsageScheduleWithWindows, UsageSettingsPayload } from "@/lib/usage/types";

function sanitizeSchedules(value: unknown): UsageScheduleWithWindows[] {
  if (!Array.isArray(value)) return [];

  return value.map((schedule, index) => {
    const candidate = typeof schedule === "object" && schedule ? schedule : {};
    const windows = Array.isArray((candidate as { windows?: unknown[] }).windows)
      ? ((candidate as { windows: unknown[] }).windows ?? [])
      : [];

    return {
      id: typeof (candidate as { id?: unknown }).id === "string" ? (candidate as { id: string }).id : `draft-${index}`,
      username: "global",
      name:
        typeof (candidate as { name?: unknown }).name === "string" && (candidate as { name: string }).name.trim()
          ? (candidate as { name: string }).name.trim()
          : `Schedule ${index + 1}`,
      days: Array.isArray((candidate as { days?: unknown[] }).days)
        ? ((candidate as { days: unknown[] }).days as number[])
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      all_day: Boolean((candidate as { all_day?: unknown }).all_day),
      banned: Boolean((candidate as { banned?: unknown }).banned),
      daily_allowance_seconds:
        (candidate as { daily_allowance_seconds?: unknown }).daily_allowance_seconds == null
          ? null
          : Math.max(0, Number((candidate as { daily_allowance_seconds: unknown }).daily_allowance_seconds) || 0),
      priority: Number((candidate as { priority?: unknown }).priority ?? 0),
      windows: windows
        .map((window, windowIndex) => ({
          id:
            typeof (window as { id?: unknown }).id === "string"
              ? (window as { id: string }).id
              : `draft-window-${index}-${windowIndex}`,
          schedule_id: "",
          start_time:
            typeof (window as { start_time?: unknown }).start_time === "string"
              ? (window as { start_time: string }).start_time
              : "09:00:00",
          end_time:
            typeof (window as { end_time?: unknown }).end_time === "string"
              ? (window as { end_time: string }).end_time
              : "17:00:00",
        }))
        .filter((window) => window.start_time < window.end_time),
    };
  });
}

export async function GET() {
  try {
    const settings = await getUsageSettingsPayload();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<UsageSettingsPayload>;

    const payload: UsageSettingsPayload = {
      timezone: typeof body.timezone === "string" ? body.timezone : "Australia/Brisbane",
      dailyLimitSeconds: Math.max(60, Number(body.dailyLimitSeconds) || 3600),
      schedules: sanitizeSchedules(body.schedules),
    };

    const settings = await saveUsageSettingsPayload(payload);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 },
    );
  }
}
