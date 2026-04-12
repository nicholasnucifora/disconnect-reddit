"use client";

import type { Feed } from "@/lib/feeds";

export interface UsageBrowsingContext {
  feedId: string;
  feedName: string;
  subreddit?: string | null;
}

const PAGE_USAGE_CONTEXTS: Array<{
  prefix: string;
  context: UsageBrowsingContext;
}> = [
  {
    prefix: "/watch-time",
    context: { feedId: "watch-time", feedName: "Watch Time", subreddit: null },
  },
  {
    prefix: "/usage",
    context: { feedId: "watch-time", feedName: "Watch Time", subreddit: null },
  },
  {
    prefix: "/settings",
    context: { feedId: "settings", feedName: "Settings", subreddit: null },
  },
];

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

  if (!pathname || pathname.startsWith("/auth")) {
    return null;
  }

  const pageUsageContext = PAGE_USAGE_CONTEXTS.find((entry) => pathname.startsWith(entry.prefix));
  if (pageUsageContext) return pageUsageContext.context;

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
