export interface RedditGalleryImage {
  url: string;
  width: number;
  height: number;
}

export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  permalink: string;
  thumbnail: string | null;
  selftext: string;
  isVideo: boolean;
  isSelf: boolean;
  createdUtc: number;
  flair: string | null;
  domain: string;
  stickied: boolean;
  isGallery: boolean;
  galleryImages: RedditGalleryImage[];
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  replies: CommentOrMore[];
  depth: number;
  isMore: false;
  count: number;
}

export interface RedditMoreComments {
  id: string;
  isMore: true;
  children: string[];
  count: number;
  parentId: string;
}

export type CommentOrMore = RedditComment | RedditMoreComments;

export interface CommentTree {
  post: RedditPost;
  comments: CommentOrMore[];
  diagnostics?: CommentFetchDiagnostics;
}

export interface RedditPostMetrics {
  postId: string;
  numComments: number;
  score: number;
}

export interface CommentFetchDiagnostics {
  totalRows: number;
  keptRows: number;
  filteredDuplicateIds: number;
  filteredMismatchedLinkIds: number;
  filteredMismatchedRootParents: number;
  filteredOrphanReplies: number;
  filteredInvalidRows: number;
}

export function countLoadedComments(comments: CommentOrMore[]): number {
  let count = 0;
  for (const comment of comments) {
    if (comment.isMore) continue;
    count += 1 + countLoadedComments(comment.replies);
  }
  return count;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
};

// Arctic Shift returns posts as flat objects (no {kind, data} wrapper)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapArchivePost(d: any): RedditPost {
  let isGallery = false;
  let galleryImages: RedditGalleryImage[] = [];
  if (d.is_gallery && d.gallery_data?.items && d.media_metadata) {
    isGallery = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    galleryImages = (d.gallery_data.items as any[])
      .map((item: { media_id: string }) => {
        const meta = d.media_metadata[item.media_id];
        if (!meta?.s?.u) return null;
        return {
          url: (meta.s.u as string).replace(/&amp;/g, "&"),
          width: meta.s.x ?? 0,
          height: meta.s.y ?? 0,
        };
      })
      .filter((x): x is RedditGalleryImage => x !== null);
  }

  return {
    id: d.id,
    title: d.title ?? "",
    author: d.author ?? "[deleted]",
    subreddit: d.subreddit ?? "",
    score: d.score ?? 0,
    numComments: d.num_comments ?? 0,
    url: d.url ?? "",
    permalink: d.permalink ?? "",
    thumbnail:
      d.thumbnail &&
      d.thumbnail !== "self" &&
      d.thumbnail !== "default" &&
      d.thumbnail !== "nsfw" &&
      d.thumbnail !== "spoiler" &&
      d.thumbnail.startsWith("http")
        ? d.thumbnail
        : null,
    selftext: d.selftext ?? "",
    isVideo: d.is_video ?? false,
    isSelf: d.is_self ?? false,
    createdUtc: d.created_utc ?? 0,
    flair: d.link_flair_text ?? null,
    domain: d.domain ?? "",
    stickied: d.stickied ?? false,
    isGallery,
    galleryImages,
  };
}

// Uses Arctic Shift - actively maintained Reddit archive, works from Vercel, no auth needed.
export async function fetchSubredditPosts(
  subreddit: string,
  _sort: "hot" | "top" | "new" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${subreddit}&limit=${limit}&sort=desc`;

  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText} - ${body}`
    );
  }

  const json = await res.json();
  const posts: unknown[] = json?.data ?? [];

  if (posts.length === 0) {
    throw new Error(
      `r/${subreddit}: Arctic Shift returned 0 posts (keys: ${Object.keys(json ?? {}).join(", ")})`
    );
  }

  return posts.map(mapArchivePost);
}

export async function fetchSubredditPostsWindow(
  subreddit: string,
  afterUtc: number,
  beforeUtc: number,
  pageSize = 100
): Promise<RedditPost[]> {
  const collected = new Map<string, RedditPost>();
  let cursorBefore = beforeUtc;

  while (cursorBefore >= afterUtc) {
    const params = new URLSearchParams({
      subreddit,
      limit: String(pageSize),
      sort: "desc",
      after: String(afterUtc),
      before: String(cursorBefore),
    });

    const res = await fetch(
      `https://arctic-shift.photon-reddit.com/api/posts/search?${params.toString()}`,
      { headers: BROWSER_HEADERS }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText} - ${body}`
      );
    }

    const json = await res.json();
    const posts = ((json?.data ?? []) as unknown[]).map(mapArchivePost);

    if (posts.length === 0) break;

    for (const post of posts) {
      collected.set(post.id, post);
    }

    const oldestCreatedUtc = posts.reduce(
      (oldest, post) => Math.min(oldest, post.createdUtc),
      posts[0].createdUtc
    );

    if (posts.length < pageSize || oldestCreatedUtc <= afterUtc) {
      break;
    }

    cursorBefore = oldestCreatedUtc - 1;
  }

  return Array.from(collected.values());
}

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  _slug: string
): Promise<CommentTree> {
  const [postRes, commentsRes] = await Promise.all([
    fetch(`https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${postId}`, {
      headers: BROWSER_HEADERS,
    }),
    fetch(`https://arctic-shift.photon-reddit.com/api/comments/search?link_id=${postId}&limit=500`, {
      headers: BROWSER_HEADERS,
    }),
  ]);

  let post: RedditPost = {
    id: postId,
    title: "",
    author: "",
    subreddit,
    score: 0,
    numComments: 0,
    url: "",
    permalink: "",
    thumbnail: null,
    selftext: "",
    isVideo: false,
    isSelf: false,
    createdUtc: 0,
    flair: null,
    domain: "",
    stickied: false,
    isGallery: false,
    galleryImages: [],
  };

  if (postRes.ok) {
    const postJson = await postRes.json();
    const postData = postJson?.data?.[0];
    if (postData) post = mapArchivePost(postData);
  }

  if (!commentsRes.ok) {
    const body = await commentsRes.text().catch(() => "");
    throw new Error(
      `Failed to fetch comments for post ${postId}: ${commentsRes.status} ${commentsRes.statusText} - ${body}`
    );
  }

  const json = await commentsRes.json();
  type ArchiveCommentRow = {
    id?: string;
    author?: string;
    body?: string;
    score?: number;
    created_utc?: number;
    parent_id?: string;
    link_id?: string;
  };
  type NormalizedArchiveCommentRow = ArchiveCommentRow & { id: string };

  const flat = (json?.data ?? json?.results ?? []) as ArchiveCommentRow[];
  const expectedLinkId = `t3_${postId}`;
  const diagnostics: CommentFetchDiagnostics = {
    totalRows: flat.length,
    keptRows: 0,
    filteredDuplicateIds: 0,
    filteredMismatchedLinkIds: 0,
    filteredMismatchedRootParents: 0,
    filteredOrphanReplies: 0,
    filteredInvalidRows: 0,
  };
  const seenCommentIds = new Set<string>();
  const normalizedRows: NormalizedArchiveCommentRow[] = [];

  for (const row of flat) {
    if (!row?.id) {
      diagnostics.filteredInvalidRows += 1;
      continue;
    }

    if (
      row.link_id &&
      row.link_id !== postId &&
      row.link_id !== expectedLinkId
    ) {
      diagnostics.filteredMismatchedLinkIds += 1;
      continue;
    }

    if (seenCommentIds.has(row.id)) {
      diagnostics.filteredDuplicateIds += 1;
      continue;
    }

    seenCommentIds.add(row.id);
    normalizedRows.push({ ...row, id: row.id });
  }

  diagnostics.keptRows = normalizedRows.length;

  const commentMap = new Map<string, RedditComment>();
  for (const d of normalizedRows) {
    commentMap.set(d.id, {
      id: d.id,
      author: d.author ?? "[deleted]",
      body: d.body ?? "",
      score: d.score ?? 0,
      createdUtc: d.created_utc ?? 0,
      replies: [],
      depth: 0,
      isMore: false,
      count: 0,
    });
  }

  const roots: CommentOrMore[] = [];
  for (const d of normalizedRows) {
    const comment = commentMap.get(d.id);
    if (!comment) continue;

    if (!d.parent_id) {
      diagnostics.filteredInvalidRows += 1;
      continue;
    }

    if (d.parent_id.startsWith("t3_") || d.parent_id === postId) {
      if (d.parent_id !== expectedLinkId && d.parent_id !== postId) {
        diagnostics.filteredMismatchedRootParents += 1;
        continue;
      }

      roots.push(comment);
    } else if (d.parent_id.startsWith("t1_")) {
      const parent = commentMap.get(d.parent_id.slice(3));
      if (parent) {
        parent.replies.push(comment);
      } else {
        diagnostics.filteredOrphanReplies += 1;
      }
    } else {
      diagnostics.filteredInvalidRows += 1;
    }
  }

  function setDepths(comments: CommentOrMore[], depth: number) {
    for (const c of comments) {
      if (!c.isMore) {
        (c as RedditComment).depth = depth;
        setDepths((c as RedditComment).replies, depth + 1);
      }
    }
  }

  setDepths(roots, 0);

  const hasDiagnostics = Object.entries(diagnostics).some(
    ([key, value]) => key !== "totalRows" && key !== "keptRows" && value > 0
  );

  if (hasDiagnostics) {
    console.warn(`Comment fetch anomalies detected for post ${postId}`, diagnostics);
  }

  return { post, comments: roots, diagnostics: hasDiagnostics ? diagnostics : undefined };
}

export async function fetchPostMetricsByIds(postIds: string[]): Promise<Map<string, RedditPostMetrics>> {
  const uniquePostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));
  if (uniquePostIds.length === 0) return new Map();

  const batchSize = 500;
  const batches: string[][] = [];
  for (let index = 0; index < uniquePostIds.length; index += batchSize) {
    batches.push(uniquePostIds.slice(index, index + batchSize));
  }

  const entries = await Promise.all(
    batches.map(async (batch) => {
      const params = new URLSearchParams({
        ids: batch.join(","),
        fields: "id,num_comments,score",
      });

      const res = await fetch(
        `https://arctic-shift.photon-reddit.com/api/posts/ids?${params.toString()}`,
        { headers: BROWSER_HEADERS }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Failed to fetch post metrics for ids ${batch.join(",")}: ${res.status} ${res.statusText} - ${body}`
        );
      }

      const json = await res.json();
      const posts = (json?.data ?? []) as Array<{
        id?: string;
        num_comments?: number;
        score?: number;
      }>;

      return posts
        .filter((post): post is { id: string; num_comments?: number; score?: number } => Boolean(post.id))
        .map((post) => ({
          postId: post.id,
          numComments: post.num_comments ?? 0,
          score: post.score ?? 0,
        }));
    })
  );

  return new Map(entries.flat().map((entry) => [entry.postId, entry] as const));
}

export async function fetchPostCommentCount(postId: string): Promise<number> {
  const metrics = await fetchPostMetricsByIds([postId]);
  return metrics.get(postId)?.numComments ?? 0;
}

export async function fetchPostScore(postId: string): Promise<number> {
  const metrics = await fetchPostMetricsByIds([postId]);
  return metrics.get(postId)?.score ?? 0;
}

// Not currently used (legacy "load more" via Reddit direct - kept for reference)
export async function fetchMoreComments(): Promise<RedditComment[]> {
  return [];
}
