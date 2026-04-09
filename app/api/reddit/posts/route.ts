import { NextRequest, NextResponse } from "next/server";
import { getCachedCommentCounts } from "@/lib/comment-count-cache";
import { fetchSubredditPosts, RedditPost } from "@/lib/reddit";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const subredditsParam = searchParams.get("subreddits");
  const sort = (searchParams.get("sort") ?? "hot") as "hot" | "top" | "new";

  if (!subredditsParam) {
    return NextResponse.json(
      { error: "Missing required query param: subreddits" },
      { status: 400 }
    );
  }

  const subreddits = subredditsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (subreddits.length === 0) {
    return NextResponse.json(
      { error: "subreddits param must contain at least one subreddit" },
      { status: 400 }
    );
  }

  try {
    const results = await Promise.allSettled(
      subreddits.map((sub) => fetchSubredditPosts(sub, sort, 100))
    );

    const posts: RedditPost[] = [];
    const errors: string[] = [];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        posts.push(...result.value);
      } else {
        errors.push(`r/${subreddits[i]}: ${result.reason?.message ?? "Unknown error"}`);
      }
    });

    // Keep only posts from the last 3 days
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;

    // Filter out stickied, deleted, removed, and old posts; sort by score descending
    const merged = posts
      .filter((p) => !p.stickied)
      .filter((p) => p.createdUtc >= threeDaysAgo)
      .filter(
        (p) =>
          p.author !== "[deleted]" &&
          p.selftext !== "[deleted]" &&
          p.selftext !== "[removed]" &&
          p.title !== "[deleted]" &&
          p.title !== "[removed]"
      )
      .sort((a, b) => b.score - a.score);

    const cachedCounts = await getCachedCommentCounts(merged.map((post) => post.id));
    const withCachedCounts = merged.map((post) => {
      const cached = cachedCounts.get(post.id);
      if (!cached) return post;
      return {
        ...post,
        numComments: Math.max(post.numComments, cached.numComments),
      };
    });

    return NextResponse.json(
      { posts: withCachedCounts, errors: errors.length > 0 ? errors : undefined },
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
