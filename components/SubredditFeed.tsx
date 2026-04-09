"use client";

import { useEffect, useMemo, useState } from "react";
import { RedditPost } from "@/lib/reddit";
import PostCard from "./PostCard";

interface SubredditFeedProps {
  subreddit: string;
}

export default function SubredditFeed({ subreddit }: SubredditFeedProps) {
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visiblePostsKey = useMemo(
    () => posts.slice(0, 24).map((post) => post.id).join(","),
    [posts]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPosts([]);
    fetch(`/api/reddit/posts?subreddits=${encodeURIComponent(subreddit)}&sort=hot`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        setPosts(data.posts ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [subreddit]);

  useEffect(() => {
    if (posts.length === 0) return;

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
  }, [visiblePostsKey]);

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-teal-400 mb-6">r/{subreddit}</h1>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">No posts found</p>
        )}

        {posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
