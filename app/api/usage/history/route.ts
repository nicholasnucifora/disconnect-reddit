import { NextRequest, NextResponse } from "next/server";
import { getUsageHistory } from "@/lib/usage/server";
import type { UsageHistoryRangeMode } from "@/lib/usage/types";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");
  const history = await getUsageHistory(
    mode === "overall" ? "overall" : ("recent" satisfies UsageHistoryRangeMode),
  );
  return NextResponse.json(history);
}
