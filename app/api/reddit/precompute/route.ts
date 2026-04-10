import { NextRequest, NextResponse } from "next/server";
import {
  buildAllFeedSnapshots,
  buildAndStoreFeedSnapshot,
  clearAllFeedSnapshots,
  clearFeedSnapshot,
} from "@/lib/feed-snapshots";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? process.env.PRECOMPUTE_SECRET;
  if (!expected) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;

  const urlSecret = request.nextUrl.searchParams.get("secret");
  return urlSecret === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshots = await buildAllFeedSnapshots();
    return NextResponse.json({ ok: true, snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const feedId = typeof body?.feedId === "string" && body.feedId.trim() ? body.feedId : "home";
    if (body?.action === "clearAll") {
      const result = await clearAllFeedSnapshots();
      return NextResponse.json({
        ok: true,
        action: "clearAll",
        deletedSnapshots: result.deletedSnapshots,
      });
    }

    if (body?.action === "clear") {
      const result = await clearFeedSnapshot(feedId);
      return NextResponse.json({
        ok: true,
        action: "clear",
        feedId,
        deletedSnapshots: result.deletedSnapshots,
      });
    }

    const snapshot = await buildAndStoreFeedSnapshot(feedId, {
      forceRefresh: body?.forceRefresh === true,
    });

    return NextResponse.json({
      ok: true,
      feedId,
      generatedAt: snapshot.generatedAt,
      postCount: snapshot.posts.length,
      failedRefreshes: snapshot.failedRefreshes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
