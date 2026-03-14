"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { RedditPost } from "@/lib/reddit";
import SubredditManager from "./SubredditManager";
import PostCard from "./PostCard";

export default function FeedClient() {
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

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
    try {
      const res = await fetch(`/api/reddit/posts?subreddits=${subreddits.join(",")}&sort=hot`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const json = await res.json();
      const fetched: RedditPost[] = json.posts ?? [];
      setPosts(fetched.filter((p) => !dismissedIds.has(p.id)));
    } catch {
      // keep existing posts on error
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
        <p className="text-center text-gray-500 py-16 text-sm">
          No posts found
        </p>
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
