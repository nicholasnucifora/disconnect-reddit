"use client";

import type { Feed } from "@/lib/feeds-context";

export interface UsageBrowsingContext {
  feedId: string;
  feedName: string;
  subreddit?: string | null;
}

function getFeed(feeds: Feed[], feedId: string) {
  return feeds.find((feed) => feed.id === feedId) ?? feeds[0] ?? { id: "home", name: "Home Feed" };
}

export function getUsageBrowsingContext(args: {
  pathname: string;
  feeds: Feed[];
  activeFeedId: string;
  subredditFeedMap: Record<string, string>;
}): UsageBrowsingContext | null {
  const { pathname, feeds, activeFeedId, subredditFeedMap } = args;

  if (
    !pathname ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/usage") ||
    pathname.startsWith("/watch-time") ||
    pathname.startsWith("/settings")
  ) {
    return null;
  }

  if (pathname === "/") {
    const activeFeed = getFeed(feeds, activeFeedId);
    return { feedId: activeFeed.id, feedName: activeFeed.name, subreddit: null };
  }

  const subredditMatch = pathname.match(/^\/r\/([^/]+)/i);
  if (!subredditMatch) return null;

  const subreddit = subredditMatch[1];
  const mappedFeedId = subredditFeedMap[subreddit.toLowerCase()] ?? "home";
  const mappedFeed = getFeed(feeds, mappedFeedId);

  return {
    feedId: mappedFeed.id,
    feedName: mappedFeed.name,
    subreddit,
  };
}
