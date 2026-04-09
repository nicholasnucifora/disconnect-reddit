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
  const { getActiveFeedSubreddits } = useFeeds();
  const activeSubs = useMemo(
    () => getActiveFeedSubreddits(subreddits),
    [getActiveFeedSubreddits, subreddits]
  );
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dismissedReady, setDismissedReady] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

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

  const ready = subredditsReady && dismissedReady;
  const visiblePostsKey = useMemo(
    () => posts.slice(0, 24).map((post) => post.id).join(","),
    [posts]
  );

  const fetchPosts = useCallback(async () => {
    if (activeSubs.length === 0) {
      setPosts([]);
      return;
    }

    setLoading(true);
    setFetchErrors([]);
    try {
      const res = await fetch(`/api/reddit/posts?subreddits=${activeSubs.join(",")}&sort=hot`);
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
  }, [activeSubs, dismissedIds]);

  useEffect(() => {
    if (ready) fetchPosts();
  }, [fetchPosts, ready]);

  useEffect(() => {
    if (!ready || posts.length === 0) return;

    let cancelled = false;
    const visiblePosts = posts.slice(0, 24).map((post) => ({
      postId: post.id,
      subreddit: post.subreddit,
    }));

    async function hydrateCommentCounts() {
      try {
        const res = await fetch("/api/reddit/comment-counts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ posts: visiblePosts }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const counts = data.counts ?? {};

        if (cancelled) return;

        setPosts((prev) =>
          prev.map((post) => {
            const correctedCount = counts[post.id];
            if (typeof correctedCount !== "number" || correctedCount <= post.numComments) {
              return post;
            }
            return { ...post, numComments: correctedCount };
          })
        );
      } catch {
        // best effort only
      }
    }

    hydrateCommentCounts();

    return () => {
      cancelled = true;
    };
  }, [ready, visiblePostsKey]);

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
