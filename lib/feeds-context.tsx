"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { USERNAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { Feed, HOME_FEED } from "@/lib/feeds";

const ACTIVE_FEED_STORAGE_KEY = "disconnect_active_feed_v1";
const LEGACY_FEEDS_STORAGE_KEY = "disconnect_feeds_v1";

interface FeedsContextValue {
  feeds: Feed[];
  activeFeedId: string;
  subredditFeedMap: Record<string, string>;
  ready: boolean;
  getSubredditsForFeed: (allSubreddits: string[], feedId: string) => string[];
  getActiveFeedSubreddits: (allSubreddits: string[]) => string[];
  setActiveFeed: (id: string) => void;
  createFeed: (name: string) => Promise<Feed | null>;
  deleteFeed: (id: string) => Promise<void>;
  assignSubreddit: (subreddit: string, feedId: string) => Promise<void>;
  removeSubredditFromFeeds: (subreddit: string) => Promise<void>;
}

const FeedsContext = createContext<FeedsContextValue | null>(null);

function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^r\//i, "").toLowerCase();
}

function loadActiveFeedId(): string {
  if (typeof window === "undefined") return HOME_FEED.id;
  try {
    return localStorage.getItem(ACTIVE_FEED_STORAGE_KEY) ?? HOME_FEED.id;
  } catch {
    return HOME_FEED.id;
  }
}

function loadLegacyState(): {
  feeds: Feed[];
  subredditFeedMap: Record<string, string>;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_FEEDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      feeds?: Feed[];
      subredditFeedMap?: Record<string, string>;
    };
    return {
      feeds: parsed.feeds ?? [HOME_FEED],
      subredditFeedMap: parsed.subredditFeedMap ?? {},
    };
  } catch {
    return null;
  }
}

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([HOME_FEED]);
  const [subredditFeedMap, setSubredditFeedMap] = useState<Record<string, string>>({});
  const [activeFeedId, setActiveFeedId] = useState(HOME_FEED.id);
  const [ready, setReady] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const [feedsRes, assignmentsRes] = await Promise.all([
      supabase
        .from("user_feeds")
        .select("id, name, position")
        .eq("username", USERNAME)
        .order("position", { ascending: true }),
      supabase
        .from("user_subreddit_feeds")
        .select("subreddit, feed_id")
        .eq("username", USERNAME),
    ]);

    const feedRows = feedsRes.data ?? [];
    const assignmentRows = assignmentsRes.data ?? [];

    if (feedRows.length === 0 && assignmentRows.length === 0) {
      const legacyState = loadLegacyState();
      if (legacyState) {
        const legacyFeeds = legacyState.feeds.filter((feed) => feed.id !== HOME_FEED.id);
        if (legacyFeeds.length > 0) {
          await supabase.from("user_feeds").insert(
            legacyFeeds.map((feed, index) => ({
              id: feed.id,
              username: USERNAME,
              name: feed.name,
              position: index + 1,
            }))
          );
        }

        const legacyAssignments = Object.entries(legacyState.subredditFeedMap)
          .filter(([, feedId]) => feedId && feedId !== HOME_FEED.id)
          .map(([subreddit, feedId]) => ({
            username: USERNAME,
            subreddit: normalizeSubreddit(subreddit),
            feed_id: feedId,
          }));

        if (legacyAssignments.length > 0) {
          await supabase
            .from("user_subreddit_feeds")
            .upsert(legacyAssignments, { onConflict: "username,subreddit" });
        }

        const reloaded = await Promise.all([
          supabase
            .from("user_feeds")
            .select("id, name, position")
            .eq("username", USERNAME)
            .order("position", { ascending: true }),
          supabase
            .from("user_subreddit_feeds")
            .select("subreddit, feed_id")
            .eq("username", USERNAME),
        ]);

        const migratedFeedRows = reloaded[0].data ?? [];
        const migratedAssignmentRows = reloaded[1].data ?? [];

        setFeeds([
          HOME_FEED,
          ...migratedFeedRows
            .map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }))
            .filter((feed) => feed.id !== HOME_FEED.id),
        ]);
        setSubredditFeedMap(
          Object.fromEntries(
            migratedAssignmentRows.map((row: { subreddit: string; feed_id: string }) => [
              normalizeSubreddit(row.subreddit),
              row.feed_id,
            ])
          )
        );
        setActiveFeedId(loadActiveFeedId());
        setReady(true);
        return;
      }
    }

    setFeeds([
      HOME_FEED,
      ...feedRows
        .map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }))
        .filter((feed) => feed.id !== HOME_FEED.id),
    ]);
    setSubredditFeedMap(
      Object.fromEntries(
        assignmentRows.map((row: { subreddit: string; feed_id: string }) => [
          normalizeSubreddit(row.subreddit),
          row.feed_id,
        ])
      )
    );
    setActiveFeedId(loadActiveFeedId());
    setReady(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const getSubredditsForFeed = useCallback(
    (allSubreddits: string[], feedId: string) =>
      allSubreddits.filter((sub) => (subredditFeedMap[normalizeSubreddit(sub)] ?? HOME_FEED.id) === feedId),
    [subredditFeedMap]
  );

  const getActiveFeedSubreddits = useCallback(
    (allSubreddits: string[]) => getSubredditsForFeed(allSubreddits, activeFeedId),
    [getSubredditsForFeed, activeFeedId]
  );

  function setActiveFeed(id: string) {
    setActiveFeedId(id);
    try {
      localStorage.setItem(ACTIVE_FEED_STORAGE_KEY, id);
    } catch {
      // ignore storage issues
    }
  }

  async function createFeed(name: string): Promise<Feed | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const nextPosition = feeds.length;
    const feedId = `feed_${Date.now()}`;
    const { error } = await supabase.from("user_feeds").insert({
      id: feedId,
      username: USERNAME,
      name: trimmed,
      position: nextPosition,
    });

    if (error) return null;

    const feed = { id: feedId, name: trimmed };
    setFeeds((prev) => [...prev, feed]);
    return feed;
  }

  async function deleteFeed(id: string) {
    if (id === HOME_FEED.id) return;

    const assignedSubreddits = Object.entries(subredditFeedMap)
      .filter(([, feedId]) => feedId === id)
      .map(([subreddit]) => subreddit);

    if (assignedSubreddits.length > 0) {
      const { error: assignmentError } = await supabase
        .from("user_subreddit_feeds")
        .delete()
        .eq("username", USERNAME)
        .in("subreddit", assignedSubreddits);

      if (assignmentError) return;
    }

    const { error } = await supabase
      .from("user_feeds")
      .delete()
      .eq("username", USERNAME)
      .eq("id", id);

    if (error) return;

    setFeeds((prev) => prev.filter((feed) => feed.id !== id));
    setSubredditFeedMap((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([, feedId]) => feedId !== id))
    );
    if (activeFeedId === id) setActiveFeed(HOME_FEED.id);
  }

  async function assignSubreddit(subreddit: string, feedId: string) {
    const normalized = normalizeSubreddit(subreddit);
    if (feedId === HOME_FEED.id) {
      await removeSubredditFromFeeds(subreddit);
      return;
    }

    const { error } = await supabase.from("user_subreddit_feeds").upsert(
      {
        username: USERNAME,
        subreddit: normalized,
        feed_id: feedId,
      },
      { onConflict: "username,subreddit" }
    );

    if (error) return;
    setSubredditFeedMap((prev) => ({ ...prev, [normalized]: feedId }));
  }

  async function removeSubredditFromFeeds(subreddit: string) {
    const normalized = normalizeSubreddit(subreddit);
    const { error } = await supabase
      .from("user_subreddit_feeds")
      .delete()
      .eq("username", USERNAME)
      .eq("subreddit", normalized);

    if (error) return;

    setSubredditFeedMap((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([name]) => name !== normalized))
    );
  }

  return (
    <FeedsContext.Provider
      value={{
        feeds,
        activeFeedId,
        subredditFeedMap,
        ready,
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
