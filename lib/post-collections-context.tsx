"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  clearAllCachedPostCollections,
  clearCachedPostCollection,
  findCachedPostsForSubreddit,
  getCachedPostCollection,
  removePostFromCachedCollections,
  setCachedPostCollection,
  type CachedPostCollection,
} from "@/lib/post-feed-cache";
import type { RedditPost } from "@/lib/reddit";

interface PostCollectionsContextValue {
  getCollection: (key: string, expectedScopeToken?: string) => CachedPostCollection | null;
  setCollection: (
    key: string,
    posts: RedditPost[],
    options?: {
      generatedAt?: string;
      source?: string;
      scopeToken?: string;
    }
  ) => void;
  clearCollection: (key: string) => void;
  clearAllCollections: () => void;
  removePostEverywhere: (postId: string) => void;
  findPostsForSubreddit: (subreddit: string) => RedditPost[];
}

const PostCollectionsContext = createContext<PostCollectionsContextValue | null>(null);

function mergePosts(posts: RedditPost[]): RedditPost[] {
  const merged = new Map<string, RedditPost>();

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

  return Array.from(merged.values()).sort((a, b) => {
    if (b.numComments !== a.numComments) return b.numComments - a.numComments;
    return b.createdUtc - a.createdUtc;
  });
}

export function PostCollectionsProvider({ children }: { children: ReactNode }) {
  const collectionsRef = useRef<Map<string, CachedPostCollection>>(new Map());

  const getCollection = useCallback(
    (key: string, expectedScopeToken?: string): CachedPostCollection | null => {
      const cached = collectionsRef.current.get(key);
      const isExpired = cached != null && Date.now() - cached.cachedAt > 15 * 60 * 1000;
      const scopeMismatch =
        cached != null &&
        typeof expectedScopeToken === "string" &&
        cached.scopeToken !== expectedScopeToken;

      if (cached && !isExpired && !scopeMismatch) {
        return cached;
      }

      if (cached && (isExpired || scopeMismatch)) {
        collectionsRef.current.delete(key);
      }

      const fromStorage = getCachedPostCollection(key, expectedScopeToken);
      if (fromStorage) {
        collectionsRef.current.set(key, fromStorage);
      }
      return fromStorage;
    },
    []
  );

  const setCollection = useCallback(
    (
      key: string,
      posts: RedditPost[],
      options: {
        generatedAt?: string;
        source?: string;
        scopeToken?: string;
      } = {}
    ) => {
      setCachedPostCollection(key, posts, options);
      collectionsRef.current.set(key, {
        posts,
        cachedAt: Date.now(),
        generatedAt: options.generatedAt,
        source: options.source,
        scopeToken: options.scopeToken,
      });
    },
    []
  );

  const clearCollection = useCallback((key: string) => {
    clearCachedPostCollection(key);
    collectionsRef.current.delete(key);
  }, []);

  const clearAllCollections = useCallback(() => {
    clearAllCachedPostCollections();
    collectionsRef.current.clear();
  }, []);

  const removePostEverywhere = useCallback((postId: string) => {
    removePostFromCachedCollections(postId);
    for (const [key, collection] of Array.from(collectionsRef.current.entries())) {
      const posts = collection.posts.filter((post) => post.id !== postId);
      if (posts.length === 0) {
        collectionsRef.current.delete(key);
        continue;
      }

      collectionsRef.current.set(key, {
        ...collection,
        posts,
        cachedAt: Date.now(),
      });
    }
  }, []);

  const findPostsForSubreddit = useCallback((subreddit: string) => {
    const normalized = subreddit.trim().toLowerCase();
    const posts = mergePosts(
      Array.from(collectionsRef.current.values())
        .flatMap((collection) => collection.posts)
        .filter((post) => post.subreddit.trim().toLowerCase() === normalized)
    );

    if (posts.length > 0) return posts;
    return findCachedPostsForSubreddit(normalized);
  }, []);

  const value = useMemo<PostCollectionsContextValue>(
    () => ({
      getCollection,
      setCollection,
      clearCollection,
      clearAllCollections,
      removePostEverywhere,
      findPostsForSubreddit,
    }),
    [
      clearAllCollections,
      clearCollection,
      findPostsForSubreddit,
      getCollection,
      removePostEverywhere,
      setCollection,
    ]
  );

  return (
    <PostCollectionsContext.Provider value={value}>
      {children}
    </PostCollectionsContext.Provider>
  );
}

export function usePostCollections() {
  const context = useContext(PostCollectionsContext);
  if (!context) {
    throw new Error("usePostCollections must be used within PostCollectionsProvider");
  }
  return context;
}
