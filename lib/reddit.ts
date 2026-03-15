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
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPost(child: any): RedditPost {
  const d = child.data;
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    subreddit: d.subreddit,
    score: d.score,
    numComments: d.num_comments,
    url: d.url,
    permalink: d.permalink,
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
    createdUtc: d.created_utc,
    flair: d.link_flair_text ?? null,
    domain: d.domain ?? "",
    stickied: d.stickied ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComment(child: any, depth = 0): CommentOrMore {
  if (child.kind === "more") {
    const d = child.data;
    return {
      id: d.id,
      isMore: true,
      children: d.children ?? [],
      count: d.count ?? 0,
      parentId: d.parent_id ?? "",
    } satisfies RedditMoreComments;
  }

  const d = child.data;
  const replies: CommentOrMore[] = [];

  if (d.replies && typeof d.replies === "object" && d.replies.data?.children) {
    for (const reply of d.replies.data.children) {
      replies.push(mapComment(reply, depth + 1));
    }
  }

  return {
    id: d.id,
    author: d.author ?? "[deleted]",
    body: d.body ?? "",
    score: d.score ?? 0,
    createdUtc: d.created_utc ?? 0,
    replies,
    depth,
    isMore: false,
    count: 0,
  } satisfies RedditComment;
}

// Pullpush returns posts as flat objects (no {kind, data} wrapper like Reddit's native API)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPullpushPost(d: any): RedditPost {
  return {
    id: d.id,
    title: d.title,
    author: d.author ?? "[deleted]",
    subreddit: d.subreddit,
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
  };
}

// Uses Pullpush.io (free Pushshift alternative) — works from Vercel servers, no auth needed.
export async function fetchSubredditPosts(
  subreddit: string,
  _sort: "hot" | "top" | "new" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${subreddit}&size=${limit}`;

  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();
  // Pullpush wraps results in either json.data or json.results depending on version
  const posts: unknown[] = json?.data ?? json?.results ?? [];

  if (posts.length === 0) {
    throw new Error(
      `r/${subreddit}: Pullpush returned 0 posts (raw keys: ${Object.keys(json ?? {}).join(", ")})`
    );
  }

  return posts.map(mapPullpushPost);
}

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  slug: string
): Promise<CommentTree> {
  const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}/${slug}.json?limit=200`;

  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch comments for post ${postId}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();

  const postChild = json[0]?.data?.children?.[0];
  if (!postChild) {
    throw new Error("Unexpected Reddit response structure for post.");
  }
  const post = mapPost(postChild);

  const commentChildren: unknown[] = json[1]?.data?.children ?? [];
  const comments = commentChildren.map((c) => mapComment(c, 0));

  return { post, comments };
}

export async function fetchMoreComments(
  subreddit: string,
  postId: string,
  commentId: string
): Promise<RedditComment[]> {
  const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}/comment/${commentId}.json`;

  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch more comments (${commentId}): ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();

  const commentChildren: unknown[] = json[1]?.data?.children ?? [];

  return commentChildren
    .map((c) => mapComment(c, 0))
    .filter((c): c is RedditComment => !c.isMore);
}
