"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { RedditPost } from "@/lib/reddit";
import { useSubreddits } from "@/lib/subreddits-context";
import { useFeeds } from "@/lib/feeds-context";
import PostCard from "./PostCard";

export default function FeedClient() {
  const { subreddits, ready: subredditsReady } = useSubreddits();
  const { feeds, activeFeedId, getActiveFeedSubreddits, ready: feedsReady } = useFeeds();
  const activeSubs = useMemo(
    () => getActiveFeedSubreddits(subreddits),
    [getActiveFeedSubreddits, subreddits]
  );
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedReady, setDismissedReady] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("dismissed_posts")
        .select("post_id")
        .eq("username", USERNAME)
        .gt("expires_at", new Date().toISOString());

      const supabaseIds = (data ?? []).map((r: { post_id: string }) => r.post_id);
      let localIds: string[] = [];
      try {
        localIds = JSON.parse(sessionStorage.getItem("localDismissed") ?? "[]");
      } catch { /* ignore */ }

      setDismissedIds(new Set([...supabaseIds, ...localIds]));
      setDismissedReady(true);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = subredditsReady && dismissedReady && feedsReady;
  const fetchPosts = useCallback(async () => {
    if (activeSubs.length === 0) {
      setPosts([]);
      return;
    }

    setLoading(true);
    setFetchErrors([]);
    try {
      const res = await fetch(`/api/reddit/feed?feedId=${encodeURIComponent(activeFeedId)}`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const json = await res.json();
      const fetched: RedditPost[] = json.posts ?? [];
      setFetchErrors(json.errors ?? []);
      setPosts(fetched.filter((p) => !dismissedIds.has(p.id)));
    } catch (e) {
      setFetchErrors([e instanceof Error ? e.message : "Unknown error"]);
    } finally {
      setLoading(false);
    }
  }, [activeFeedId, activeSubs, dismissedIds]);

  useEffect(() => {
    if (ready) fetchPosts();
  }, [fetchPosts, ready]);

  async function refreshPreparedFeed() {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const res = await fetch("/api/reddit/precompute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedId: activeFeedId }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to refresh prepared feed");
      }

      await fetchPosts();
      setRefreshMessage(`Prepared ${body.postCount ?? 0} posts just now.`);
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Failed to refresh prepared feed");
    } finally {
      setRefreshing(false);
    }
  }

  async function clearPreparedFeed() {
    setClearing(true);
    setRefreshMessage(null);
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

      await fetchPosts();
      setRefreshMessage(`Cleared ${body.deletedSnapshots ?? 0} stored snapshots for this feed.`);
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Failed to clear prepared feed");
    } finally {
      setClearing(false);
    }
  }

  async function dismissPost(postId: string) {
    setDismissedIds((prev) => new Set(Array.from(prev).concat(postId)));
    setPosts((prev) => prev.filter((p) => p.id !== postId));

    try {
      const local = JSON.parse(sessionStorage.getItem("localDismissed") ?? "[]");
      if (!local.includes(postId)) {
        local.push(postId);
        sessionStorage.setItem("localDismissed", JSON.stringify(local));
      }
    } catch { /* ignore */ }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    supabase.from("dismissed_posts").insert({
      username: USERNAME,
      post_id: postId,
      expires_at: expiresAt.toISOString(),
    });
  }

  useEffect(() => {
    function handleUndismiss(e: Event) {
      const post = (e as CustomEvent<RedditPost>).detail;
      setDismissedIds((prev) => {
        const next = new Set(Array.from(prev));
        next.delete(post.id);
        return next;
      });
      setPosts((prev) =>
        [post, ...prev].sort((a, b) => b.createdUtc - a.createdUtc)
      );
    }
    window.addEventListener("undismissPost", handleUndismiss);
    return () => window.removeEventListener("undismissPost", handleUndismiss);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-200">
            {feeds.find((feed) => feed.id === activeFeedId)?.name ?? "Home Feed"}
          </p>
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

      {refreshMessage && (
        <p className="text-sm text-gray-400">{refreshMessage}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeSubs.length === 0 ? (
        <p className="text-center text-gray-500 py-16 text-sm">
          {subreddits.length === 0
            ? "Add a subreddit in the sidebar to get started"
            : "No subreddits in this feed — drag some over from another feed"}
        </p>
      ) : posts.length === 0 ? (
        <div className="py-16 space-y-2">
          <p className="text-center text-gray-500 text-sm">No posts found</p>
          {fetchErrors.length > 0 && (
            <div className="text-xs text-red-400 bg-red-950/40 rounded p-3 space-y-1">
              {fetchErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDismiss={dismissPost}
            />
          ))}
        </div>
      )}
    </div>
  );
}
