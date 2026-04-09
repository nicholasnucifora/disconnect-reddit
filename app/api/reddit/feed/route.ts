import { NextRequest, NextResponse } from "next/server";
import { getOrBuildFeedSnapshot } from "@/lib/feed-snapshots";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const feedId = request.nextUrl.searchParams.get("feedId") ?? "home";

  try {
    const snapshot = await getOrBuildFeedSnapshot(feedId);
    return NextResponse.json(
      {
        posts: snapshot.posts,
        generatedAt: snapshot.generatedAt,
        source: snapshot.source,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
