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
  filteredRemovedComments: number;
}

export const DIGEST_POST_LOOKBACK_DAYS = 3;
export const DIGEST_POST_LOOKBACK_SECONDS = DIGEST_POST_LOOKBACK_DAYS * 24 * 60 * 60;

export function countLoadedComments(comments: CommentOrMore[]): number {
  let count = 0;
  for (const comment of comments) {
    if (comment.isMore) continue;
    count += 1 + countLoadedComments(comment.replies);
  }
  return count;
}

export function getArchivePostAfterUtc(nowUtc = Math.floor(Date.now() / 1000)): number {
  return nowUtc - DIGEST_POST_LOOKBACK_SECONDS;
}

export function mergeRedditPosts(posts: RedditPost[]): RedditPost[] {
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
      title: post.title || existing.title,
      author: post.author && post.author !== "[deleted]" ? post.author : existing.author,
      subreddit: post.subreddit || existing.subreddit,
      url: post.url || existing.url,
      permalink: post.permalink || existing.permalink,
      thumbnail: post.thumbnail ?? existing.thumbnail,
      selftext: post.selftext || existing.selftext,
      flair: post.flair ?? existing.flair,
      domain: post.domain || existing.domain,
      numComments: Math.max(existing.numComments, post.numComments),
      score: Math.max(existing.score, post.score),
      createdUtc: Math.max(existing.createdUtc, post.createdUtc),
      isVideo: existing.isVideo || post.isVideo,
      isSelf: existing.isSelf || post.isSelf,
      stickied: existing.stickied || post.stickied,
      isGallery: existing.isGallery || post.isGallery,
      galleryImages:
        post.galleryImages.length > 0 ? post.galleryImages : existing.galleryImages,
    });
  }

  return Array.from(merged.values());
}

function isGifOnlyComment(comment: RedditComment): boolean {
  return /\bgif\b/i.test(comment.body.trim());
}

function normalizeCommentBody(body: string): string {
  return body.replace(/\s+/g, " ").trim().toLowerCase();
}

function getCommentSemanticKey(comment: RedditComment): string | null {
  const normalizedAuthor = comment.author.trim().toLowerCase();
  const normalizedBody = normalizeCommentBody(comment.body);

  if (
    !normalizedAuthor ||
    normalizedAuthor === "[deleted]" ||
    normalizedBody.length < 48
  ) {
    return null;
  }

  return `${normalizedAuthor}::${normalizedBody}`;
}

function shouldMergeSemantically(existing: RedditComment, incoming: RedditComment): boolean {
  const existingKey = getCommentSemanticKey(existing);
  const incomingKey = getCommentSemanticKey(incoming);

  if (!existingKey || !incomingKey || existingKey !== incomingKey) {
    return false;
  }

  return Math.abs(existing.createdUtc - incoming.createdUtc) <= 10 * 60;
}

function mergeCommentInto(existing: RedditComment, incoming: RedditComment) {
  existing.author =
    existing.author === "[deleted]" && incoming.author !== "[deleted]"
      ? incoming.author
      : existing.author;
  existing.body = existing.body.length >= incoming.body.length ? existing.body : incoming.body;
  existing.score = Math.max(existing.score, incoming.score);
  existing.createdUtc = Math.max(existing.createdUtc, incoming.createdUtc);
  existing.count = Math.max(existing.count, incoming.count);
  existing.replies = mergeCommentReplies(existing.replies, incoming.replies);
}

function mergeCommentReplies(
  existingReplies: CommentOrMore[],
  incomingReplies: CommentOrMore[]
): CommentOrMore[] {
  const existingById = new Map<string, RedditComment>();
  const existingBySemanticKey = new Map<string, RedditComment>();
  const seenMoreKeys = new Set<string>();

  for (const reply of existingReplies) {
    if (reply.isMore) {
      seenMoreKeys.add(`${reply.id}:${reply.parentId}`);
      continue;
    }

    existingById.set(reply.id, reply);
    const semanticKey = getCommentSemanticKey(reply);
    if (semanticKey && !existingBySemanticKey.has(semanticKey)) {
      existingBySemanticKey.set(semanticKey, reply);
    }
  }

  for (const reply of incomingReplies) {
    if (reply.isMore) {
      const key = `${reply.id}:${reply.parentId}`;
      if (!seenMoreKeys.has(key)) {
        existingReplies.push(reply);
        seenMoreKeys.add(key);
      }
      continue;
    }

    const existing = existingById.get(reply.id);
    if (existing) {
      mergeCommentInto(existing, reply);
      continue;
    }

    const semanticKey = getCommentSemanticKey(reply);
    const semanticMatch =
      semanticKey ? existingBySemanticKey.get(semanticKey) : undefined;
    if (semanticMatch && shouldMergeSemantically(semanticMatch, reply)) {
      mergeCommentInto(semanticMatch, reply);
      continue;
    }

    existingReplies.push(reply);
    existingById.set(reply.id, reply);
    if (semanticKey && !existingBySemanticKey.has(semanticKey)) {
      existingBySemanticKey.set(semanticKey, reply);
    }
  }

  const nonGifReplies = existingReplies.filter(
    (reply) => reply.isMore || !isGifOnlyComment(reply)
  );
  const gifReplies = existingReplies.filter(
    (reply) => !reply.isMore && isGifOnlyComment(reply)
  );

  return [...nonGifReplies, ...gifReplies];
}

function dedupeAndOrderComments(comments: CommentOrMore[]): CommentOrMore[] {
  const seenComments = new Map<string, RedditComment>();
  const seenSemanticComments = new Map<string, RedditComment>();
  const seenMoreKeys = new Set<string>();
  const ordered: CommentOrMore[] = [];

  for (const entry of comments) {
    if (entry.isMore) {
      const key = `${entry.id}:${entry.parentId}`;
      if (!seenMoreKeys.has(key)) {
        ordered.push(entry);
        seenMoreKeys.add(key);
      }
      continue;
    }

    entry.replies = dedupeAndOrderComments(entry.replies);

    const existing = seenComments.get(entry.id);
    if (existing) {
      mergeCommentInto(existing, entry);
      continue;
    }

    const semanticKey = getCommentSemanticKey(entry);
    const semanticMatch =
      semanticKey ? seenSemanticComments.get(semanticKey) : undefined;
    if (semanticMatch && shouldMergeSemantically(semanticMatch, entry)) {
      mergeCommentInto(semanticMatch, entry);
      continue;
    }

    seenComments.set(entry.id, entry);
    if (semanticKey && !seenSemanticComments.has(semanticKey)) {
      seenSemanticComments.set(semanticKey, entry);
    }
    ordered.push(entry);
  }

  const nonGifComments = ordered.filter(
    (entry) => entry.isMore || !isGifOnlyComment(entry)
  );
  const gifComments = ordered.filter(
    (entry) => !entry.isMore && isGifOnlyComment(entry)
  );

  return [...nonGifComments, ...gifComments];
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
};

const COMMENT_PAGE_SIZE = 100;
const MAX_COMMENT_PAGES = 20;

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
  function isHiddenPlaceholder(comment: RedditComment): boolean {
    const normalizedAuthor = comment.author.trim().toLowerCase();
    const normalizedBody = comment.body.trim().toLowerCase();

    return (
      normalizedAuthor === "[deleted]" &&
      (normalizedBody === "[removed]" || normalizedBody === "[deleted]")
    );
  }

  function stripRemovedPlaceholders(comments: CommentOrMore[]): CommentOrMore[] {
    const next: CommentOrMore[] = [];

    for (const entry of comments) {
      if (entry.isMore) {
        next.push(entry);
        continue;
      }

      entry.replies = stripRemovedPlaceholders(entry.replies);

      if (isHiddenPlaceholder(entry)) {
        diagnostics.filteredRemovedComments += 1;
        next.push(...entry.replies);
        continue;
      }

      next.push(entry);
    }

    return next;
  }

  async function fetchCommentsPage(beforeUtc?: number) {
    const params = new URLSearchParams({
      link_id: postId,
      limit: String(COMMENT_PAGE_SIZE),
      sort: "desc",
    });

    if (typeof beforeUtc === "number") {
      params.set("before", String(beforeUtc));
    }

    const response = await fetch(
      `https://arctic-shift.photon-reddit.com/api/comments/search?${params.toString()}`,
      {
        headers: BROWSER_HEADERS,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to fetch comments for post ${postId}: ${response.status} ${response.statusText} - ${body}`
      );
    }

    const json = await response.json();
    return (json?.data ?? json?.results ?? []) as ArchiveCommentRow[];
  }

  const postPromise = fetch(`https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${postId}`, {
    headers: BROWSER_HEADERS,
  });

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

  const firstPage = await fetchCommentsPage();
  const postRes = await postPromise;

  if (postRes.ok) {
    const postJson = await postRes.json();
    const postData = postJson?.data?.[0];
    if (postData) post = mapArchivePost(postData);
  }

  const flat: ArchiveCommentRow[] = [...firstPage];
  let currentPage = firstPage;
  let pagesFetched = 1;

  while (currentPage.length === COMMENT_PAGE_SIZE && pagesFetched < MAX_COMMENT_PAGES) {
    const oldestCreatedUtc = currentPage.reduce(
      (oldest, comment) =>
        typeof comment.created_utc === "number"
          ? Math.min(oldest, comment.created_utc)
          : oldest,
      currentPage[0]?.created_utc ?? Number.NaN
    );

    if (!Number.isFinite(oldestCreatedUtc)) {
      break;
    }

    currentPage = await fetchCommentsPage(oldestCreatedUtc - 1);
    if (currentPage.length === 0) {
      break;
    }

    flat.push(...currentPage);
    pagesFetched += 1;
  }

  const expectedLinkId = `t3_${postId}`;
  const diagnostics: CommentFetchDiagnostics = {
    totalRows: flat.length,
    keptRows: 0,
    filteredDuplicateIds: 0,
    filteredMismatchedLinkIds: 0,
    filteredMismatchedRootParents: 0,
    filteredOrphanReplies: 0,
    filteredInvalidRows: 0,
    filteredRemovedComments: 0,
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

  const visibleRoots = dedupeAndOrderComments(stripRemovedPlaceholders(roots));

  setDepths(visibleRoots, 0);

  const hasDiagnostics = Object.entries(diagnostics).some(
    ([key, value]) => key !== "totalRows" && key !== "keptRows" && value > 0
  );

  if (hasDiagnostics) {
    console.warn(`Comment fetch anomalies detected for post ${postId}`, diagnostics);
  }

  return {
    post,
    comments: visibleRoots,
    diagnostics: hasDiagnostics ? diagnostics : undefined,
  };
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
