"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { usePostCollections } from "@/lib/post-collections-context";
import {
  clearFeedClearedMark,
  filterDismissedPosts,
  getDismissedPostIds,
  getFeedCacheKey,
  getSubredditCacheKey,
  isFeedMarkedCleared,
  markFeedCleared,
  persistDismissedPost,
  removeDismissedPost,
} from "@/lib/post-feed-cache";
import { RedditPost } from "@/lib/reddit";
import { useFeeds } from "@/lib/feeds-context";
import { useSubreddits } from "@/lib/subreddits-context";
import PostCard from "./PostCard";

function mergeFeedPosts(postGroups: RedditPost[][]): RedditPost[] {
  const merged = new Map<string, RedditPost>();

  for (const posts of postGroups) {
    for (const post of posts) {
      const existing = merged.get(post.id);
      if (!existing) {
        merged.set(post.id, post);
        continue;
      }

      merged.set(post.id, {
        ...existing,
        ...post,
        numComments: Math.max(existing.numComments, post.numComments),
        score: Math.max(existing.score, post.score),
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (b.numComments !== a.numComments) return b.numComments - a.numComments;
    return b.createdUtc - a.createdUtc;
  });
}

export default function FeedClient() {
  const { subreddits, ready: subredditsReady } = useSubreddits();
  const { feeds, activeFeedId, getActiveFeedSubreddits, ready: feedsReady } = useFeeds();
  const {
    clearCollection,
    findPostsForSubreddit,
    getCollection,
    removePostEverywhere,
    setCollection,
  } = usePostCollections();
  const activeSubs = useMemo(
    () => getActiveFeedSubreddits(subreddits),
    [getActiveFeedSubreddits, subreddits]
  );
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedCleared, setFeedCleared] = useState(false);
  const [dismissedReady, setDismissedReady] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshFailures, setRefreshFailures] = useState<
    Array<{ postId: string; subreddit: string; title?: string; error: string }>
  >([]);
  const [preparedPostCount, setPreparedPostCount] = useState(0);
  const [contentEpoch, setContentEpoch] = useState(0);

  const supabase = createClient();
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const requestIdRef = useRef(0);
  const feedClearedRef = useRef(false);
  const activeFeedName = feeds.find((feed) => feed.id === activeFeedId)?.name ?? "Home Feed";
  const cacheKey = useMemo(() => getFeedCacheKey(activeFeedId), [activeFeedId]);
  const scopeToken = useMemo(
    () => activeSubs.map((subreddit) => subreddit.trim().toLowerCase()).sort().join("|"),
    [activeSubs]
  );

  const updateSubredditCaches = useCallback(
    (subredditsToCache: string[], postsToCache: RedditPost[]) => {
      for (const subreddit of subredditsToCache) {
        const normalized = subreddit.trim().toLowerCase();
        const subredditPosts = postsToCache.filter(
          (post) => post.subreddit.trim().toLowerCase() === normalized
        );
        setCollection(getSubredditCacheKey(normalized), subredditPosts, {
          source: "feed-derived",
          scopeToken: normalized,
        });
      }
    },
    [setCollection]
  );

  const applyPosts = useCallback((nextPosts: RedditPost[]) => {
    if (feedClearedRef.current) return;
    setPosts(filterDismissedPosts(nextPosts, dismissedIdsRef.current));
  }, []);

  const applyFetchedFeedPosts = useCallback(
    (
      nextPosts: RedditPost[],
      options: { generatedAt?: string; source?: string } = {}
    ) => {
      updateSubredditCaches(activeSubs, nextPosts);
      setCollection(cacheKey, nextPosts, {
        generatedAt: options.generatedAt,
        source: options.source,
        scopeToken,
      });
      clearFeedClearedMark(activeFeedId);
      feedClearedRef.current = false;
      setFetchErrors([]);
      setRefreshFailures([]);
      setFeedCleared(false);
      setPreparedPostCount(nextPosts.length);
      applyPosts(nextPosts);
    },
    [activeFeedId, activeSubs, applyPosts, cacheKey, scopeToken, setCollection, updateSubredditCaches]
  );

  useEffect(() => {
    const localIds = getDismissedPostIds();
    dismissedIdsRef.current = localIds;
    setDismissedIds(localIds);
    setDismissedReady(true);

    async function syncDismissedPosts() {
      const { data } = await supabase
        .from("dismissed_posts")
        .select("post_id")
        .eq("username", USERNAME)
        .gt("expires_at", new Date().toISOString());

      const supabaseIds = new Set((data ?? []).map((row: { post_id: string }) => row.post_id));
      const mergedIds = new Set<string>([
        ...Array.from(localIds),
        ...Array.from(supabaseIds),
      ]);
      dismissedIdsRef.current = mergedIds;
      setDismissedIds(mergedIds);
      setPosts((prev) => filterDismissedPosts(prev, mergedIds));
    }

    void syncDismissedPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dismissedIdsRef.current = dismissedIds;
  }, [dismissedIds]);

  useEffect(() => {
    feedClearedRef.current = feedCleared;
  }, [feedCleared]);

  useEffect(() => {
    const cleared = isFeedMarkedCleared(activeFeedId);
    feedClearedRef.current = cleared;
    setFeedCleared(cleared);
    if (cleared) {
      setPosts([]);
      setLoading(false);
      setFetchErrors([]);
      setRefreshFailures([]);
      setPreparedPostCount(0);
      setContentEpoch((value) => value + 1);
    }
  }, [activeFeedId]);

  const ready = subredditsReady && dismissedReady && feedsReady;

  const fetchPosts = useCallback(
    async (options: { forceRefresh?: boolean } = {}) => {
      if (activeSubs.length === 0) {
        setPosts([]);
        setLoading(false);
        setPreparedPostCount(0);
        return;
      }

      if (!options.forceRefresh && isFeedMarkedCleared(activeFeedId)) {
        feedClearedRef.current = true;
        setPosts([]);
        setLoading(false);
        setFetchErrors([]);
        setRefreshFailures([]);
        setFeedCleared(true);
        setPreparedPostCount(0);
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!options.forceRefresh) {
        const cached = getCollection(cacheKey, scopeToken);
        if (cached) {
          updateSubredditCaches(activeSubs, cached.posts);
          clearFeedClearedMark(activeFeedId);
          feedClearedRef.current = false;
          applyPosts(cached.posts);
          setFetchErrors([]);
          setRefreshFailures([]);
          setFeedCleared(false);
          setLoading(false);
          return;
        }

        const cachedSubredditPosts = activeSubs
          .map((subreddit) => {
            const normalized = subreddit.trim().toLowerCase();
            const cached =
              getCollection(getSubredditCacheKey(normalized), normalized) ??
              (() => {
                const fallbackPosts = findPostsForSubreddit(normalized);
                if (fallbackPosts.length === 0) return null;
                setCollection(getSubredditCacheKey(normalized), fallbackPosts, {
                  source: "collection-derived",
                  scopeToken: normalized,
                });
                return {
                  posts: fallbackPosts,
                  cachedAt: Date.now(),
                  source: "collection-derived",
                  scopeToken: normalized,
                };
              })();

            return {
              subreddit: normalized,
              posts: cached?.posts ?? [],
            };
          })
          .filter((entry) => entry.posts.length > 0);

        const cachedSubredditNames = new Set(cachedSubredditPosts.map((entry) => entry.subreddit));
        const missingSubreddits = activeSubs
          .map((subreddit) => subreddit.trim().toLowerCase())
          .filter((subreddit) => !cachedSubredditNames.has(subreddit));

        if (cachedSubredditPosts.length > 0) {
          const mergedCachedPosts = mergeFeedPosts(
            cachedSubredditPosts.map((entry) => entry.posts)
          );

          if (missingSubreddits.length === 0) {
            applyFetchedFeedPosts(mergedCachedPosts, {
              source: "subreddit-cache",
            });
            setLoading(false);
            return;
          }

          setLoading(true);
          try {
            const response = await fetch(
              `/api/reddit/posts?subreddits=${encodeURIComponent(
                missingSubreddits.join(",")
              )}&sort=hot`,
              { cache: "no-store" }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.error) {
              throw new Error(data.error ?? "Failed to fetch posts");
            }

            if (requestIdRef.current !== requestId) return;

            const fetchedMissingPosts: RedditPost[] = Array.isArray(data.posts)
              ? data.posts
              : [];

            const mergedPosts = mergeFeedPosts([
              ...cachedSubredditPosts.map((entry) => entry.posts),
              fetchedMissingPosts,
            ]);
            applyFetchedFeedPosts(mergedPosts, {
              source: "subreddit-cache+network",
            });
            setFetchErrors(Array.isArray(data.errors) ? data.errors : []);
            setLoading(false);
            return;
          } catch (error) {
            if (requestIdRef.current !== requestId) return;
            setFetchErrors([
              error instanceof Error ? error.message : "Unknown error",
            ]);
            setLoading(false);
            return;
          }
        }
      }

      setLoading(true);
      setFetchErrors([]);
      try {
        const res = await fetch(`/api/reddit/feed?feedId=${encodeURIComponent(activeFeedId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch posts");

        const json = await res.json();
        const fetched: RedditPost[] = json.posts ?? [];

        if (requestIdRef.current !== requestId) return;

        applyFetchedFeedPosts(fetched, {
          generatedAt: json.generatedAt,
          source: json.source,
        });
        setFetchErrors(json.errors ?? []);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        setFetchErrors([error instanceof Error ? error.message : "Unknown error"]);
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [
      activeFeedId,
      activeSubs,
      activeSubs.length,
      applyFetchedFeedPosts,
      applyPosts,
      cacheKey,
      findPostsForSubreddit,
      getCollection,
      scopeToken,
      setCollection,
      updateSubredditCaches,
    ]
  );

  useEffect(() => {
    if (ready && !feedCleared) {
      void fetchPosts();
    }
  }, [feedCleared, fetchPosts, ready]);

  useEffect(() => {
    setContentEpoch((value) => value + 1);
  }, [activeFeedId]);

  async function refreshPreparedFeed() {
    setRefreshing(true);
    setRefreshMessage(null);
    clearFeedClearedMark(activeFeedId);
    feedClearedRef.current = false;
    setFeedCleared(false);
    setRefreshFailures([]);
    try {
      const res = await fetch("/api/reddit/precompute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedId: activeFeedId, forceRefresh: true }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to refresh prepared feed");
      }

      const refreshedPosts = Array.isArray(body.posts) ? (body.posts as RedditPost[]) : null;
      if (refreshedPosts) {
        applyFetchedFeedPosts(refreshedPosts, {
          generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : undefined,
          source: "refreshed",
        });
      } else {
        await fetchPosts({ forceRefresh: true });
      }
      const failedRefreshes = Array.isArray(body.failedRefreshes) ? body.failedRefreshes : [];
      if (failedRefreshes.length > 0) {
        const titleMap = new Map(posts.map((post) => [post.id, post.title] as const));
        setRefreshFailures(
          failedRefreshes.map((entry: { postId: string; subreddit: string; error: string }) => ({
            ...entry,
            title: titleMap.get(entry.postId),
          }))
        );
      }
      setRefreshMessage(
        failedRefreshes.length > 0
          ? `Prepared ${body.postCount ?? 0} posts with ${failedRefreshes.length} refresh failures.`
          : `Prepared ${body.postCount ?? 0} posts just now.`
      );
    } catch (error) {
      setRefreshMessage(
        error instanceof Error ? error.message : "Failed to refresh prepared feed"
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function clearPreparedFeed() {
    setClearing(true);
    setRefreshMessage(null);
    requestIdRef.current += 1;
    markFeedCleared(activeFeedId);
    feedClearedRef.current = true;
    clearCollection(cacheKey);
    setPosts([]);
    setLoading(false);
    setFetchErrors([]);
    setRefreshFailures([]);
    setPreparedPostCount(0);
    setFeedCleared(true);
    setContentEpoch((value) => value + 1);
    try {
      const res = await fetch("/api/reddit/precompute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "clear", feedId: activeFeedId }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to clear prepared feed");
      }

      setRefreshMessage(`Cleared ${body.deletedSnapshots ?? 0} stored snapshots for this feed.`);
    } catch (error) {
      clearFeedClearedMark(activeFeedId);
      feedClearedRef.current = false;
      setFeedCleared(false);
      setRefreshMessage(error instanceof Error ? error.message : "Failed to clear prepared feed");
    } finally {
      setClearing(false);
    }
  }

  async function dismissPost(postId: string) {
    const nextDismissedIds = new Set(dismissedIdsRef.current);
    nextDismissedIds.add(postId);
    dismissedIdsRef.current = nextDismissedIds;
    setDismissedIds(nextDismissedIds);
    setPosts((prev) => prev.filter((post) => post.id !== postId));

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const expiresAtIso = expiresAt.toISOString();

    persistDismissedPost(postId, expiresAtIso);
    removePostEverywhere(postId);

    void supabase.from("dismissed_posts").upsert(
      {
        username: USERNAME,
        post_id: postId,
        expires_at: expiresAtIso,
      },
      {
        onConflict: "username,post_id",
      }
    );
  }

  useEffect(() => {
    function handleUndismiss(event: Event) {
      const post = (event as CustomEvent<RedditPost>).detail;
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        dismissedIdsRef.current = next;
        return next;
      });
      removeDismissedPost(post.id);
      setPosts((prev) => [post, ...prev].sort((a, b) => b.createdUtc - a.createdUtc));
    }

    window.addEventListener("undismissPost", handleUndismiss);
    return () => window.removeEventListener("undismissPost", handleUndismiss);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const visiblePosts = feedCleared ? [] : posts;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-200">{activeFeedName}</p>
          <p className="text-xs text-gray-500">
            Rebuild this feed snapshot now to test fresh comment counts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearPreparedFeed}
            disabled={loading || clearing || refreshing || activeSubs.length === 0}
            className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/50 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
          >
            {clearing ? "Clearing..." : "Clear Feed Data"}
          </button>
          <button
            onClick={refreshPreparedFeed}
            disabled={loading || clearing || refreshing || activeSubs.length === 0}
            className="rounded bg-teal-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {refreshing ? "Refreshing..." : "Refresh Feed Data"}
          </button>
        </div>
      </div>

      {refreshMessage && <p className="text-sm text-gray-400">{refreshMessage}</p>}

      {refreshFailures.length > 0 && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          <p className="font-medium">Some posts could not be recounted.</p>
          <div className="mt-2 space-y-1 text-xs text-amber-100/90">
            {refreshFailures.slice(0, 8).map((failure) => (
              <p key={failure.postId}>
                r/{failure.subreddit}{" "}
                {failure.title ? `- ${failure.title}` : `- ${failure.postId}`} ({failure.postId}):
                {" "}{failure.error}
              </p>
            ))}
          </div>
        </div>
      )}

      <div key={`${activeFeedId}:${contentEpoch}:${feedCleared ? "cleared" : "live"}`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : activeSubs.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">
            {subreddits.length === 0
              ? "Add a subreddit in the sidebar to get started"
              : "No subreddits in this feed - drag some over from another feed"}
          </p>
        ) : visiblePosts.length === 0 ? (
          <div className="space-y-2 py-16">
            <p className="text-center text-sm text-gray-500">
              {feedCleared
                ? "Feed data cleared. Refresh to rebuild this snapshot."
                : preparedPostCount > 0
                ? `Prepared ${preparedPostCount} posts, but they are currently hidden by removed posts.`
                : "No posts found"}
            </p>
            {fetchErrors.length > 0 && (
              <div className="space-y-1 rounded bg-red-950/40 p-3 text-xs text-red-400">
                {fetchErrors.map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post) => (
              <PostCard key={post.id} post={post} onDismiss={dismissPost} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
