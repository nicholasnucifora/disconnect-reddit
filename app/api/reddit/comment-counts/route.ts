import { NextRequest, NextResponse } from "next/server";
import {
  cleanupExpiredCommentCounts,
  getCachedCommentCounts,
  isCommentCountStale,
  upsertCommentCounts,
} from "@/lib/comment-count-cache";
import { refreshCommentCounts } from "@/lib/comment-count-refresh";

export const runtime = "edge";

interface CommentCountRequestPost {
  postId: string;
  subreddit: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const posts = Array.isArray(body?.posts)
      ? (body.posts as CommentCountRequestPost[])
          .filter((post) => typeof post?.postId === "string" && typeof post?.subreddit === "string")
          .slice(0, 24)
      : [];

    if (posts.length === 0) {
      return NextResponse.json({ counts: {} }, { status: 200 });
    }

    cleanupExpiredCommentCounts().catch(() => {});

    const cached = await getCachedCommentCounts(posts.map((post) => post.postId));
    const toRefresh = posts.filter((post) => {
      const cachedEntry = cached.get(post.postId);
      return !cachedEntry || isCommentCountStale(cachedEntry);
    });

    const refreshResult = await refreshCommentCounts(toRefresh, 4);

    if (refreshResult.refreshed.length > 0) {
      await upsertCommentCounts(refreshResult.refreshed);
      for (const entry of refreshResult.refreshed) {
        cached.set(entry.postId, {
          postId: entry.postId,
          subreddit: entry.subreddit,
          numComments: entry.numComments,
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    const counts = Object.fromEntries(
      posts.map((post) => [post.postId, cached.get(post.postId)?.numComments ?? null])
    );

    return NextResponse.json(
      { counts },
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
