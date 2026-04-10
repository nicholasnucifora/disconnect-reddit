import { type RedditPost } from "@/lib/reddit";

const POST_COLLECTION_CACHE_PREFIX = "disconnect_reddit_post_collection_v1:";
const CLEARED_FEED_STORAGE_PREFIX = "disconnect_reddit_cleared_feed_v1:";
const DISMISSED_POSTS_STORAGE_KEY = "disconnect_reddit_dismissed_posts_v1";
const LEGACY_SESSION_DISMISSED_KEY = "localDismissed";

export const POST_COLLECTION_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedPostCollection {
  posts: RedditPost[];
  cachedAt: number;
  generatedAt?: string;
  source?: string;
  scopeToken?: string;
}

interface DismissedPostEntry {
  id: string;
  expiresAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseCachedCollection(raw: string | null): CachedPostCollection | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedPostCollection;
    if (!Array.isArray(parsed.posts) || typeof parsed.cachedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readDismissedEntries(): DismissedPostEntry[] {
  if (!canUseStorage()) return [];

  const now = Date.now();
  const entries = new Map<string, DismissedPostEntry>();

  try {
    const raw = window.localStorage.getItem(DISMISSED_POSTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DismissedPostEntry[];
      for (const entry of parsed) {
        if (!entry?.id || !entry.expiresAt) continue;
        if (new Date(entry.expiresAt).getTime() <= now) continue;
        entries.set(entry.id, entry);
      }
    }
  } catch {
    // Ignore malformed cache entries.
  }

  try {
    const legacyRaw = window.sessionStorage.getItem(LEGACY_SESSION_DISMISSED_KEY);
    if (legacyRaw) {
      const legacyIds = JSON.parse(legacyRaw) as string[];
      const fallbackExpiry = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      for (const id of legacyIds) {
        if (typeof id !== "string" || !id) continue;
        if (!entries.has(id)) {
          entries.set(id, { id, expiresAt: fallbackExpiry });
        }
      }
      window.sessionStorage.removeItem(LEGACY_SESSION_DISMISSED_KEY);
    }
  } catch {
    // Ignore malformed legacy entries.
  }

  const nextEntries = Array.from(entries.values());
  try {
    window.localStorage.setItem(DISMISSED_POSTS_STORAGE_KEY, JSON.stringify(nextEntries));
  } catch {
    // Ignore storage write failures.
  }

  return nextEntries;
}

function writeDismissedEntries(entries: DismissedPostEntry[]) {
  if (!canUseStorage()) return;

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(DISMISSED_POSTS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DISMISSED_POSTS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage write failures.
  }
}

export function getFeedCacheKey(feedId: string): string {
  return `feed:${feedId}`;
}

export function getSubredditCacheKey(subreddit: string): string {
  return `subreddit:${subreddit.trim().toLowerCase()}`;
}

export function getCachedPostCollection(
  key: string,
  expectedScopeToken?: string
): CachedPostCollection | null {
  if (!canUseStorage()) return null;

  const storageKey = `${POST_COLLECTION_CACHE_PREFIX}${key}`;
  const cached = parseCachedCollection(window.localStorage.getItem(storageKey));
  if (!cached) return null;

  const isExpired = Date.now() - cached.cachedAt > POST_COLLECTION_CACHE_TTL_MS;
  const scopeMismatch =
    typeof expectedScopeToken === "string" && cached.scopeToken !== expectedScopeToken;

  if (isExpired || scopeMismatch) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage write failures.
    }
    return null;
  }

  return cached;
}

export function setCachedPostCollection(
  key: string,
  posts: RedditPost[],
  options: {
    generatedAt?: string;
    source?: string;
    scopeToken?: string;
  } = {}
) {
  if (!canUseStorage()) return;

  const payload: CachedPostCollection = {
    posts,
    cachedAt: Date.now(),
    generatedAt: options.generatedAt,
    source: options.source,
    scopeToken: options.scopeToken,
  };

  try {
    window.localStorage.setItem(
      `${POST_COLLECTION_CACHE_PREFIX}${key}`,
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage write failures.
  }
}

export function clearCachedPostCollection(key: string) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(`${POST_COLLECTION_CACHE_PREFIX}${key}`);
  } catch {
    // Ignore storage write failures.
  }
}

export function isFeedMarkedCleared(feedId: string): boolean {
  if (!canUseStorage()) return false;

  try {
    return window.localStorage.getItem(`${CLEARED_FEED_STORAGE_PREFIX}${feedId}`) === "1";
  } catch {
    return false;
  }
}

export function markFeedCleared(feedId: string) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(`${CLEARED_FEED_STORAGE_PREFIX}${feedId}`, "1");
  } catch {
    // Ignore storage write failures.
  }
}

export function clearFeedClearedMark(feedId: string) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(`${CLEARED_FEED_STORAGE_PREFIX}${feedId}`);
  } catch {
    // Ignore storage write failures.
  }
}

export function clearAllCachedPostCollections() {
  if (!canUseStorage()) return;

  const storageKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (storageKey?.startsWith(POST_COLLECTION_CACHE_PREFIX)) {
      storageKeys.push(storageKey);
    }
  }

  for (const storageKey of storageKeys) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage write failures.
    }
  }
}

export function removePostFromCachedCollections(postId: string) {
  if (!canUseStorage()) return;

  const storageKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (storageKey) {
      storageKeys.push(storageKey);
    }
  }

  for (const storageKey of storageKeys) {
    if (!storageKey || !storageKey.startsWith(POST_COLLECTION_CACHE_PREFIX)) continue;

    const cached = parseCachedCollection(window.localStorage.getItem(storageKey));
    if (!cached) continue;

    const filteredPosts = cached.posts.filter((post) => post.id !== postId);
    if (filteredPosts.length === cached.posts.length) continue;

    if (filteredPosts.length === 0) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage write failures.
      }
      continue;
    }

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...cached,
          posts: filteredPosts,
          cachedAt: Date.now(),
        } satisfies CachedPostCollection)
      );
    } catch {
      // Ignore storage write failures.
    }
  }
}

export function getDismissedPostIds(): Set<string> {
  return new Set(readDismissedEntries().map((entry) => entry.id));
}

export function persistDismissedPost(postId: string, expiresAt: string) {
  const entries = readDismissedEntries();
  const filtered = entries.filter((entry) => entry.id !== postId);
  filtered.push({ id: postId, expiresAt });
  writeDismissedEntries(filtered);
}

export function removeDismissedPost(postId: string) {
  const entries = readDismissedEntries().filter((entry) => entry.id !== postId);
  writeDismissedEntries(entries);
}

export function filterDismissedPosts(posts: RedditPost[], dismissedIds: Set<string>): RedditPost[] {
  if (dismissedIds.size === 0) return posts;
  return posts.filter((post) => !dismissedIds.has(post.id));
}
