import { NextRequest, NextResponse } from "next/server";
import { getUsageHistory } from "@/lib/usage/server";

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get("days") ?? "30");
  const history = await getUsageHistory(days);
  return NextResponse.json(history);
}
