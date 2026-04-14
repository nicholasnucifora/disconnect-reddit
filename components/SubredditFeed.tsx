"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { hydratePostsWithCommentCounts } from "@/lib/comment-counts-client";
import { usePostCollections } from "@/lib/post-collections-context";
import {
  filterDismissedPosts,
  getDismissedPostIds,
  getSubredditCacheKey,
  persistDismissedPost,
} from "@/lib/post-feed-cache";
import { RedditPost } from "@/lib/reddit";
import PostCard from "./PostCard";

interface SubredditFeedProps {
  subreddit: string;
}

export default function SubredditFeed({ subreddit }: SubredditFeedProps) {
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const {
    findPostsForSubreddit,
    getCollection,
    removePostEverywhere,
    setCollection,
  } = usePostCollections();
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const requestIdRef = useRef(0);
  const normalizedSubreddit = useMemo(() => subreddit.trim().toLowerCase(), [subreddit]);
  const cacheKey = useMemo(() => getSubredditCacheKey(normalizedSubreddit), [normalizedSubreddit]);

  const applyPosts = useCallback((nextPosts: RedditPost[]) => {
    setPosts(filterDismissedPosts(nextPosts, dismissedIdsRef.current));
  }, []);

  useEffect(() => {
    const localIds = getDismissedPostIds();
    dismissedIdsRef.current = localIds;
    setPosts((prev) => filterDismissedPosts(prev, localIds));

    async function syncDismissedPosts() {
      const { data } = await supabase
        .from("dismissed_posts")
        .select("post_id")
        .eq("username", USERNAME)
        .gt("expires_at", new Date().toISOString());

      const supabaseIds = new Set((data ?? []).map((row: { post_id: string }) => row.post_id));
      dismissedIdsRef.current = new Set<string>([
        ...Array.from(localIds),
        ...Array.from(supabaseIds),
      ]);
      setPosts((prev) => filterDismissedPosts(prev, dismissedIdsRef.current));
    }

    void syncDismissedPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setError(null);
      setLoading(true);
      setPosts([]);

      const cached = getCollection(cacheKey, normalizedSubreddit);
      if (cached && cached.posts.length > 0) {
        applyPosts(cached.posts);
        if (cached.source === "subreddit" || cached.source === "feed-derived") {
          setLoading(false);
          return;
        }
      }

      const cachedFromOtherCollections = findPostsForSubreddit(normalizedSubreddit);
      if (cachedFromOtherCollections.length > 0) {
        setCollection(cacheKey, cachedFromOtherCollections, {
          source: "collection-derived",
          scopeToken: normalizedSubreddit,
        });
        applyPosts(cachedFromOtherCollections);
      }

      try {
        const response = await fetch(
          `/api/reddit/posts?subreddits=${encodeURIComponent(normalizedSubreddit)}&sort=hot`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Failed to load");
        }

        const hydratedPosts = await hydratePostsWithCommentCounts(data.posts ?? []);
        if (cancelled || requestIdRef.current !== requestId) return;

        setCollection(cacheKey, hydratedPosts, {
          source: "subreddit",
          scopeToken: normalizedSubreddit,
        });
        applyPosts(hydratedPosts);
      } catch (fetchError) {
        if (cancelled || requestIdRef.current !== requestId) return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load");
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      cancelled = true;
    };
  }, [applyPosts, cacheKey, findPostsForSubreddit, getCollection, normalizedSubreddit, setCollection]);

  async function dismissPost(postId: string) {
    const nextDismissedIds = new Set(dismissedIdsRef.current);
    nextDismissedIds.add(postId);
    dismissedIdsRef.current = nextDismissedIds;
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

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-xl font-bold text-teal-400">r/{subreddit}</h1>
        <p className="mb-6 text-sm text-gray-500">{posts.length} loaded</p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          </div>
        )}

        {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No posts found</p>
        )}

        {posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onDismiss={dismissPost} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
