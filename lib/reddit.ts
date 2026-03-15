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

const USER_AGENT = "disconnect-reddit/0.1.0 (by disconnect-app)";

// Module-level token cache — reused across requests within the same function instance
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars are not set");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Failed to get Reddit access token: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  // Expire 60s early to avoid using a token right as it expires
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };

  return cachedToken.value;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
  };
}

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

export async function fetchSubredditPosts(
  subreddit: string,
  sort: "hot" | "top" | "new" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const token = await getAccessToken();
  const url = `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=${limit}`;

  const res = await fetch(url, {
    headers: authHeaders(token),
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();
  const children: unknown[] = json?.data?.children ?? [];
  return children.map(mapPost);
}

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  slug: string
): Promise<CommentTree> {
  const token = await getAccessToken();
  const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}/${slug}?limit=200`;

  const res = await fetch(url, {
    headers: authHeaders(token),
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch comments for post ${postId}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();

  // Reddit returns a two-element array: [postListing, commentListing]
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
  const token = await getAccessToken();
  const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}/comment/${commentId}`;

  const res = await fetch(url, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch more comments (${commentId}): ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();

  // Reddit returns a two-element array; comments are in the second listing
  const commentChildren: unknown[] = json[1]?.data?.children ?? [];

  return commentChildren
    .map((c) => mapComment(c, 0))
    .filter((c): c is RedditComment => !c.isMore);
}
