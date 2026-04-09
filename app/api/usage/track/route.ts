import { NextRequest, NextResponse } from "next/server";
import { trackUsageEntries } from "@/lib/usage/server";
import type { UsageTrackEntryInput } from "@/lib/usage/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body?.entries) ? (body.entries as UsageTrackEntryInput[]) : [];
  const status = await trackUsageEntries(entries);
  return NextResponse.json(status);
}
