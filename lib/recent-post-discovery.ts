import {
  getArchivePostAfterUtc,
  mergeRedditPosts,
  type RedditGalleryImage,
  type RedditPost,
} from "@/lib/reddit";
import { normalizeSubreddit } from "@/lib/subreddit-rules";

const RECENT_DISCOVERY_TIMEOUT_MS = 12000;
const RECENT_DISCOVERY_LIMIT_PER_SUBREDDIT = 150;

interface RecentDiscoveryError {
  subreddit: string;
  error: string;
}

interface RecentDiscoveryResult {
  posts: RedditPost[];
  errors: RecentDiscoveryError[];
  source: string | null;
}

function getRecentDiscoveryEndpoint(): string | null {
  const endpoint = process.env.RECENT_DISCOVERY_ENDPOINT?.trim();
  return endpoint ? endpoint : null;
}

function normalizeRecentDiscoveryImage(value: unknown): RedditGalleryImage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const image = value as Record<string, unknown>;
  if (typeof image.url !== "string" || image.url.length === 0) {
    return null;
  }

  return {
    url: image.url,
    width: typeof image.width === "number" ? image.width : 0,
    height: typeof image.height === "number" ? image.height : 0,
  };
}

function normalizeRecentDiscoveryPost(value: unknown): RedditPost | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const post = value as Record<string, unknown>;
  if (
    typeof post.id !== "string" ||
    post.id.length === 0 ||
    typeof post.subreddit !== "string" ||
    post.subreddit.length === 0
  ) {
    return null;
  }

  const galleryImages = Array.isArray(post.galleryImages)
    ? post.galleryImages
        .map(normalizeRecentDiscoveryImage)
        .filter((image): image is RedditGalleryImage => image !== null)
    : [];

  return {
    id: post.id,
    title: typeof post.title === "string" ? post.title : "",
    author: typeof post.author === "string" ? post.author : "[deleted]",
    subreddit: normalizeSubreddit(post.subreddit),
    score: typeof post.score === "number" ? post.score : 0,
    numComments: typeof post.numComments === "number" ? post.numComments : 0,
    url: typeof post.url === "string" ? post.url : "",
    permalink: typeof post.permalink === "string" ? post.permalink : "",
    thumbnail: typeof post.thumbnail === "string" ? post.thumbnail : null,
    selftext: typeof post.selftext === "string" ? post.selftext : "",
    isVideo: post.isVideo === true,
    isSelf: post.isSelf === true,
    createdUtc: typeof post.createdUtc === "number" ? post.createdUtc : 0,
    flair: typeof post.flair === "string" ? post.flair : null,
    domain: typeof post.domain === "string" ? post.domain : "",
    stickied: post.stickied === true,
    isGallery: post.isGallery === true,
    galleryImages,
  };
}

export async function fetchRecentDiscoveryPosts(
  subreddits: string[],
  nowUtc = Math.floor(Date.now() / 1000)
): Promise<RecentDiscoveryResult> {
  const endpoint = getRecentDiscoveryEndpoint();
  if (!endpoint) {
    return {
      posts: [],
      errors: [],
      source: null,
    };
  }

  const normalizedSubreddits = Array.from(
    new Set(subreddits.map((subreddit) => normalizeSubreddit(subreddit)).filter(Boolean))
  );

  if (normalizedSubreddits.length === 0) {
    return {
      posts: [],
      errors: [],
      source: "external-worker",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECENT_DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        subreddits: normalizedSubreddits,
        afterUtc: getArchivePostAfterUtc(nowUtc),
        beforeUtc: nowUtc,
        limitPerSubreddit: RECENT_DISCOVERY_LIMIT_PER_SUBREDDIT,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      return {
        posts: [],
        errors: normalizedSubreddits.map((subreddit) => ({
          subreddit,
          error: `Recent discovery failed: ${message}`,
        })),
        source: "external-worker",
      };
    }

    const rawPosts: unknown[] = Array.isArray(body?.posts) ? (body.posts as unknown[]) : [];
    const posts = rawPosts
          .map(normalizeRecentDiscoveryPost)
          .filter((post): post is RedditPost => post !== null)
          .filter((post) => post.createdUtc >= getArchivePostAfterUtc(nowUtc));

    const rawErrors: unknown[] = Array.isArray(body?.errors) ? (body.errors as unknown[]) : [];
    const errors = rawErrors
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const normalized = entry as Record<string, unknown>;
            if (typeof normalized.subreddit !== "string" || typeof normalized.error !== "string") {
              return null;
            }

            return {
              subreddit: normalizeSubreddit(normalized.subreddit),
              error: normalized.error,
            } satisfies RecentDiscoveryError;
          })
          .filter((entry): entry is RecentDiscoveryError => entry !== null);

    return {
      posts: mergeRedditPosts(posts),
      errors,
      source:
        typeof body?.source === "string" && body.source.trim().length > 0
          ? body.source
          : "external-worker",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown recent discovery error";
    return {
      posts: [],
      errors: normalizedSubreddits.map((subreddit) => ({
        subreddit,
        error: `Recent discovery failed: ${message}`,
      })),
      source: "external-worker",
    };
  } finally {
    clearTimeout(timeout);
  }
}
