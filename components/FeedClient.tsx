"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { RedditPost, fetchSubredditPosts } from "@/lib/reddit";
import SubredditManager from "./SubredditManager";
import PostCard from "./PostCard";

export default function FeedClient() {
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  const supabase = createClient();

  // Load subreddits + dismissed IDs on mount
  useEffect(() => {
    async function init() {
      const [subsResult, dismissedResult] = await Promise.all([
        supabase
          .from("user_subreddits")
          .select("subreddit")
          .eq("username", USERNAME)
          .order("added_at", { ascending: true }),
        supabase
          .from("dismissed_posts")
          .select("post_id")
          .eq("username", USERNAME)
          .gt("expires_at", new Date().toISOString()),
      ]);

      setSubreddits((subsResult.data ?? []).map((r: { subreddit: string }) => r.subreddit));
      setDismissedIds(new Set((dismissedResult.data ?? []).map((r: { post_id: string }) => r.post_id)));
      setReady(true);
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPosts = useCallback(async () => {
    if (subreddits.length === 0) {
      setPosts([]);
      return;
    }

    setLoading(true);
    setFetchErrors([]);
    try {
      // Fetch directly from the browser so Reddit sees the user's residential IP,
      // not Vercel's blocked datacenter IPs.
      const results = await Promise.allSettled(
        subreddits.map((sub) => fetchSubredditPosts(sub, "hot", 25))
      );

      const fetched: RedditPost[] = [];
      const errors: string[] = [];

      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          fetched.push(...result.value);
        } else {
          errors.push(`r/${subreddits[i]}: ${result.reason?.message ?? "Unknown error"}`);
        }
      });

      const merged = fetched
        .filter((p) => !p.stickied && !dismissedIds.has(p.id))
        .sort((a, b) => b.score - a.score);

      setFetchErrors(errors);
      setPosts(merged);
    } catch (e) {
      setFetchErrors([e instanceof Error ? e.message : "Unknown error"]);
    } finally {
      setLoading(false);
    }
  }, [subreddits, dismissedIds]);

  useEffect(() => {
    if (ready) fetchPosts();
  }, [fetchPosts, ready]);

  async function addSubreddit(name: string) {
    const { error } = await supabase
      .from("user_subreddits")
      .insert({ username: USERNAME, subreddit: name });
    if (!error) setSubreddits((prev) => [...prev, name]);
  }

  async function removeSubreddit(name: string) {
    const { error } = await supabase
      .from("user_subreddits")
      .delete()
      .eq("username", USERNAME)
      .eq("subreddit", name);
    if (!error) setSubreddits((prev) => prev.filter((s) => s !== name));
  }

  async function dismissPost(postId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase.from("dismissed_posts").insert({
      username: USERNAME,
      post_id: postId,
      expires_at: expiresAt.toISOString(),
    });

    setDismissedIds((prev) => new Set([...Array.from(prev), postId]));
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function toggleExpand(postId: string) {
    setExpandedPostId((prev) => (prev === postId ? null : postId));
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SubredditManager
        subreddits={subreddits}
        onAdd={addSubreddit}
        onRemove={removeSubreddit}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : subreddits.length === 0 ? (
        <p className="text-center text-gray-500 py-16 text-sm">
          Add a subreddit to get started
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
              isExpanded={expandedPostId === post.id}
              onToggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
