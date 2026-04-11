import { NextRequest, NextResponse } from "next/server";
import { registerDailyOpen } from "@/lib/usage/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const status = await registerDailyOpen(sessionId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register app open" },
      { status: 500 },
    );
  }
}
