import { NextRequest, NextResponse } from "next/server";
import {
  getCachedCommentCounts,
  isCommentCountStale,
  upsertCommentCounts,
} from "@/lib/comment-count-cache";
import { refreshCommentCounts } from "@/lib/comment-count-refresh";
import { fetchSubredditPosts, RedditPost } from "@/lib/reddit";
import { loadUserSubredditRuleMap } from "@/lib/subreddit-rules-server";
import {
  applySubredditRuleCaps,
  createDefaultSubredditRule,
  normalizeSubreddit,
  SUBREDDIT_CANDIDATE_FETCH_LIMIT,
} from "@/lib/subreddit-rules";

export const runtime = "nodejs";

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
    const subredditRuleMap = await loadUserSubredditRuleMap();
    const results = await Promise.allSettled(
      subreddits.map((subreddit) =>
        fetchSubredditPosts(subreddit, sort, SUBREDDIT_CANDIDATE_FETCH_LIMIT)
      )
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

    // Filter out stickied, deleted, removed, and old posts; sort by comment activity then recency
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
      .sort((a, b) => {
        if (b.numComments !== a.numComments) return b.numComments - a.numComments;
        return b.createdUtc - a.createdUtc;
      });

    const cachedCounts = await getCachedCommentCounts(merged.map((post) => post.id));
    const postsToRefresh = merged
      .slice(0, 24)
      .filter((post) => {
        const cached = cachedCounts.get(post.id);
        return !cached || isCommentCountStale(cached);
      })
      .map((post) => ({
        postId: post.id,
        subreddit: post.subreddit,
      }));

    const refreshResult = await refreshCommentCounts(postsToRefresh, 4);
    if (refreshResult.refreshed.length > 0) {
      await upsertCommentCounts(refreshResult.refreshed);
      for (const entry of refreshResult.refreshed) {
        cachedCounts.set(entry.postId, {
          postId: entry.postId,
          subreddit: entry.subreddit,
          numComments: entry.numComments,
          score: entry.score,
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    const withCachedCounts = merged
      .map((post) => {
        const cached = cachedCounts.get(post.id);
        if (!cached) return post;
        return {
          ...post,
          numComments: Math.max(post.numComments, cached.numComments),
          score: Math.max(post.score, cached.score),
        };
      });

    const cappedPosts = applySubredditRuleCaps(
      withCachedCounts,
      new Map(
        subreddits.map((subreddit) => {
          const normalized = normalizeSubreddit(subreddit);
          return [
            normalized,
            subredditRuleMap.get(normalized) ?? createDefaultSubredditRule(subreddit),
          ] as const;
        })
      )
    );

    return NextResponse.json(
      { posts: cappedPosts, errors: errors.length > 0 ? errors : undefined },
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
