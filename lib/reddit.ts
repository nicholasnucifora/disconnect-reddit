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
// sort=desc gives newest posts first.
export async function fetchSubredditPosts(
  subreddit: string,
  _sort: "hot" | "top" | "new" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${subreddit}&size=${limit}&sort=desc`;

  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();
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
  _slug: string
): Promise<CommentTree> {
  const url = `https://api.pullpush.io/reddit/search/comment/?link_id=${postId}&size=100`;

  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch comments for post ${postId}: ${res.status} ${res.statusText} — ${body}`
    );
  }

  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flat: any[] = json?.data ?? json?.results ?? [];

  // Build a tree from the flat list using parent_id relationships
  const commentMap = new Map<string, RedditComment>();
  for (const d of flat) {
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
  for (const d of flat) {
    const comment = commentMap.get(d.id);
    if (!comment) continue;
    if (d.parent_id?.startsWith("t3_")) {
      roots.push(comment);
    } else if (d.parent_id?.startsWith("t1_")) {
      const parent = commentMap.get(d.parent_id.slice(3));
      if (parent) {
        parent.replies.push(comment);
      } else {
        roots.push(comment); // parent not in set, treat as root
      }
    }
  }

  // Set depths recursively
  function setDepths(comments: CommentOrMore[], depth: number) {
    for (const c of comments) {
      if (!c.isMore) {
        (c as RedditComment).depth = depth;
        setDepths((c as RedditComment).replies, depth + 1);
      }
    }
  }
  setDepths(roots, 0);

  // Stub post — CommentThread only uses comments, not the post field
  const post: RedditPost = {
    id: postId, title: "", author: "", subreddit, score: 0,
    numComments: flat.length, url: "", permalink: "", thumbnail: null,
    selftext: "", isVideo: false, isSelf: false, createdUtc: 0,
    flair: null, domain: "", stickied: false,
  };

  return { post, comments: roots };
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
