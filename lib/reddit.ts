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

// Arctic Shift returns posts as flat objects (no {kind, data} wrapper)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapArchivePost(d: any): RedditPost {
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
  };
}

// Uses Arctic Shift — actively maintained Reddit archive, works from Vercel, no auth needed.
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
      `Failed to fetch posts for r/${subreddit}: ${res.status} ${res.statusText} — ${body}`
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

export async function fetchPostComments(
  subreddit: string,
  postId: string,
  _slug: string
): Promise<CommentTree> {
  // Fetch post data and comments in parallel
  const [postRes, commentsRes] = await Promise.all([
    fetch(
      `https://arctic-shift.photon-reddit.com/api/posts/search?ids=${postId}`,
      { headers: BROWSER_HEADERS }
    ),
    fetch(
      `https://arctic-shift.photon-reddit.com/api/comments/search?link_id=${postId}&limit=100`,
      { headers: BROWSER_HEADERS }
    ),
  ]);

  // Build post — best effort, fall back to stub if fetch fails
  let post: RedditPost = {
    id: postId, title: "", author: "", subreddit, score: 0,
    numComments: 0, url: "", permalink: "", thumbnail: null,
    selftext: "", isVideo: false, isSelf: false, createdUtc: 0,
    flair: null, domain: "", stickied: false,
  };
  if (postRes.ok) {
    const postJson = await postRes.json();
    const d = postJson?.data?.[0];
    if (d) post = mapArchivePost(d);
  }

  if (!commentsRes.ok) {
    const body = await commentsRes.text().catch(() => "");
    throw new Error(
      `Failed to fetch comments for post ${postId}: ${commentsRes.status} ${commentsRes.statusText} — ${body}`
    );
  }

  const json = await commentsRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flat: any[] = json?.data ?? json?.results ?? [];

  // Build comment tree from flat list using parent_id
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
        roots.push(comment);
      }
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

  return { post, comments: roots };
}

// Not currently used (legacy "load more" via Reddit direct — kept for reference)
export async function fetchMoreComments(): Promise<RedditComment[]> {
  return [];
}
