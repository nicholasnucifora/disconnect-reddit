"use client";

import { useCallback, useEffect, useState } from "react";
import type { RedditPost } from "@/lib/reddit";

const SAVED_POSTS_KEY = "disconnect_saved_posts_v1";
const SAVED_POSTS_EVENT = "savedPostsChanged";

function readSavedPosts(): RedditPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedPosts(posts: RedditPost[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_POSTS_KEY, JSON.stringify(posts));
  window.dispatchEvent(new CustomEvent(SAVED_POSTS_EVENT, { detail: posts }));
}

export function savePost(post: RedditPost) {
  const savedPosts = readSavedPosts();
  const withoutExisting = savedPosts.filter((entry) => entry.id !== post.id);
  writeSavedPosts([post, ...withoutExisting]);
}

export function unsavePost(postId: string) {
  writeSavedPosts(readSavedPosts().filter((post) => post.id !== postId));
}

export function toggleSavedPost(post: RedditPost): boolean {
  const alreadySaved = readSavedPosts().some((entry) => entry.id === post.id);
  if (alreadySaved) {
    unsavePost(post.id);
    return false;
  }
  savePost(post);
  return true;
}

export function useSavedPosts() {
  const [savedPosts, setSavedPosts] = useState<RedditPost[]>([]);

  useEffect(() => {
    setSavedPosts(readSavedPosts());

    function handleSavedPostsChanged(event: Event) {
      const detail = (event as CustomEvent<RedditPost[]>).detail;
      setSavedPosts(Array.isArray(detail) ? detail : readSavedPosts());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === SAVED_POSTS_KEY) {
        setSavedPosts(readSavedPosts());
      }
    }

    window.addEventListener(SAVED_POSTS_EVENT, handleSavedPostsChanged);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SAVED_POSTS_EVENT, handleSavedPostsChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const isSaved = useCallback(
    (postId: string) => savedPosts.some((post) => post.id === postId),
    [savedPosts]
  );

  const toggle = useCallback((post: RedditPost) => toggleSavedPost(post), []);
  const save = useCallback((post: RedditPost) => savePost(post), []);
  const unsave = useCallback((postId: string) => unsavePost(postId), []);

  return { savedPosts, isSaved, toggle, save, unsave };
}
