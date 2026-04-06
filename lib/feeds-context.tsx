"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface Feed {
  id: string;
  name: string;
}

const HOME_FEED: Feed = { id: "home", name: "Home Feed" };
const STORAGE_KEY = "disconnect_feeds_v1";

interface StoredState {
  feeds: Feed[];
  subredditFeedMap: Record<string, string>;
}

interface FeedsContextValue {
  feeds: Feed[];
  activeFeedId: string;
  subredditFeedMap: Record<string, string>;
  getSubredditsForFeed: (allSubreddits: string[], feedId: string) => string[];
  getActiveFeedSubreddits: (allSubreddits: string[]) => string[];
  setActiveFeed: (id: string) => void;
  createFeed: (name: string) => Feed;
  deleteFeed: (id: string) => void;
  assignSubreddit: (subreddit: string, feedId: string) => void;
  removeSubredditFromFeeds: (subreddit: string) => void;
}

const FeedsContext = createContext<FeedsContextValue | null>(null);

function load(): StoredState {
  if (typeof window === "undefined") return { feeds: [HOME_FEED], subredditFeedMap: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed.feeds.find((f) => f.id === "home")) parsed.feeds.unshift(HOME_FEED);
      return parsed;
    }
  } catch {}
  return { feeds: [HOME_FEED], subredditFeedMap: {} };
}

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([HOME_FEED]);
  const [subredditFeedMap, setSubredditFeedMap] = useState<Record<string, string>>({});
  const [activeFeedId, setActiveFeedId] = useState("home");

  useEffect(() => {
    const state = load();
    setFeeds(state.feeds);
    setSubredditFeedMap(state.subredditFeedMap);
  }, []);

  function persist(newFeeds: Feed[], newMap: Record<string, string>) {
    setFeeds(newFeeds);
    setSubredditFeedMap(newMap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ feeds: newFeeds, subredditFeedMap: newMap }));
    } catch {}
  }

  const getSubredditsForFeed = useCallback(
    (allSubreddits: string[], feedId: string) =>
      allSubreddits.filter((sub) => (subredditFeedMap[sub.toLowerCase()] ?? "home") === feedId),
    [subredditFeedMap]
  );

  const getActiveFeedSubreddits = useCallback(
    (allSubreddits: string[]) => getSubredditsForFeed(allSubreddits, activeFeedId),
    [getSubredditsForFeed, activeFeedId]
  );

  function setActiveFeed(id: string) {
    setActiveFeedId(id);
  }

  function createFeed(name: string): Feed {
    const feed: Feed = { id: `feed_${Date.now()}`, name };
    persist([...feeds, feed], subredditFeedMap);
    return feed;
  }

  function deleteFeed(id: string) {
    if (id === "home") return;
    const newMap = Object.fromEntries(
      Object.entries(subredditFeedMap).map(([sub, fId]) => [sub, fId === id ? "home" : fId])
    );
    persist(feeds.filter((f) => f.id !== id), newMap);
    if (activeFeedId === id) setActiveFeedId("home");
  }

  function assignSubreddit(subreddit: string, feedId: string) {
    persist(feeds, { ...subredditFeedMap, [subreddit.toLowerCase()]: feedId });
  }

  function removeSubredditFromFeeds(subreddit: string) {
    const newMap = { ...subredditFeedMap };
    delete newMap[subreddit.toLowerCase()];
    persist(feeds, newMap);
  }

  return (
    <FeedsContext.Provider
      value={{
        feeds,
        activeFeedId,
        subredditFeedMap,
        getSubredditsForFeed,
        getActiveFeedSubreddits,
        setActiveFeed,
        createFeed,
        deleteFeed,
        assignSubreddit,
        removeSubredditFromFeeds,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeeds() {
  const ctx = useContext(FeedsContext);
  if (!ctx) throw new Error("useFeeds must be used within FeedsProvider");
  return ctx;
}
