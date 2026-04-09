import { HOME_FEED, type Feed } from "@/lib/feeds";
import { USERNAME } from "@/lib/config";
import {
  getCachedCommentCounts,
  isCommentCountStale,
  upsertCommentCounts,
} from "@/lib/comment-count-cache";
import {
  type FailedCommentCountRefresh,
  refreshCommentCounts,
} from "@/lib/comment-count-refresh";
import { fetchSubredditPosts, type RedditPost } from "@/lib/reddit";
import { createClient } from "@/lib/supabase/server";

const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_POST_LIMIT = 100;
const SNAPSHOT_REFRESH_LIMIT = 48;

export interface FeedSnapshotResult {
  posts: RedditPost[];
  generatedAt: string;
  source: "snapshot" | "rebuilt";
  failedRefreshes: FailedCommentCountRefresh[];
}

function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^r\//i, "").toLowerCase();
}

async function getFeedRows(): Promise<Feed[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_feeds")
    .select("id, name, position")
    .eq("username", USERNAME)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to load feeds: ${error.message}`);
  }

  const feeds = (data ?? []).map((row: { id: string; name: string }) => ({
    id: row.id,
    name: row.name,
  }));

  return [HOME_FEED, ...feeds.filter((feed) => feed.id !== HOME_FEED.id)];
}

async function getSubredditAssignments(): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_subreddit_feeds")
    .select("subreddit, feed_id")
    .eq("username", USERNAME);

  if (error) {
    throw new Error(`Failed to load subreddit feed assignments: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: { subreddit: string; feed_id: string }) => [
      normalizeSubreddit(row.subreddit),
      row.feed_id,
    ])
  );
}

async function getSubscribedSubreddits(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_subreddits")
    .select("subreddit")
    .eq("username", USERNAME)
    .order("added_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load subreddits: ${error.message}`);
  }

  return (data ?? []).map((row: { subreddit: string }) => row.subreddit);
}

export async function getFeedDefinitions(): Promise<{
  feeds: Feed[];
  subredditFeedMap: Record<string, string>;
}> {
  const [feeds, assignments] = await Promise.all([getFeedRows(), getSubredditAssignments()]);
  return {
    feeds,
    subredditFeedMap: Object.fromEntries(assignments.entries()),
  };
}

async function getFeedSubreddits(feedId: string): Promise<string[]> {
  const [subreddits, assignments] = await Promise.all([
    getSubscribedSubreddits(),
    getSubredditAssignments(),
  ]);

  return subreddits.filter((subreddit) => {
    const assignedFeed = assignments.get(normalizeSubreddit(subreddit)) ?? HOME_FEED.id;
    return assignedFeed === feedId;
  });
}

function mergePosts(posts: RedditPost[]): RedditPost[] {
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;

  return posts
    .filter((p) => !p.stickied)
    .filter((p) => p.createdUtc >= threeDaysAgo)
    .filter(
      (p) =>
        p.author !== "[deleted]" &&
        p.selftext !== "[deleted]" &&
        p.selftext !== "[removed]" &&
        p.title !== "[deleted]" &&
        p.title !== "[removed]"
    )
    .sort((a, b) => {
      if (b.numComments !== a.numComments) return b.numComments - a.numComments;
      return b.createdUtc - a.createdUtc;
    });
}

interface BuildFeedPostsOptions {
  forceRefresh?: boolean;
}

async function buildFeedPosts(
  feedId: string,
  options: BuildFeedPostsOptions = {}
): Promise<{ posts: RedditPost[]; failedRefreshes: FailedCommentCountRefresh[] }> {
  const subreddits = await getFeedSubreddits(feedId);
  if (subreddits.length === 0) return { posts: [], failedRefreshes: [] };

  const results = await Promise.allSettled(
    subreddits.map((subreddit) => fetchSubredditPosts(subreddit, "hot", 100))
  );

  const posts: RedditPost[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      posts.push(...result.value);
    }
  }

  const merged = mergePosts(posts);
  const cachedCounts = await getCachedCommentCounts(merged.map((post) => post.id));
  const postsToRefresh = merged
    .slice(0, options.forceRefresh ? SNAPSHOT_POST_LIMIT : SNAPSHOT_REFRESH_LIMIT)
    .filter((post) => {
      if (options.forceRefresh) return true;
      const cached = cachedCounts.get(post.id);
      return !cached || isCommentCountStale(cached);
    })
    .map((post) => ({
      postId: post.id,
      subreddit: post.subreddit,
    }));

  const refreshResult = await refreshCommentCounts(
    postsToRefresh,
    options.forceRefresh ? 1 : 4
  );
  if (refreshResult.refreshed.length > 0) {
    await upsertCommentCounts(refreshResult.refreshed);
    for (const entry of refreshResult.refreshed) {
      cachedCounts.set(entry.postId, {
        postId: entry.postId,
        subreddit: entry.subreddit,
        numComments: entry.numComments,
        score: entry.score,
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  return {
    posts: merged.slice(0, SNAPSHOT_POST_LIMIT).map((post) => {
      const cached = cachedCounts.get(post.id);
      if (!cached) return post;
      return {
        ...post,
        numComments: Math.max(post.numComments, cached.numComments),
        score: Math.max(post.score, cached.score),
      };
    }),
    failedRefreshes: refreshResult.failed,
  };
}

export async function readLatestFeedSnapshot(feedId: string): Promise<FeedSnapshotResult | null> {
  const supabase = createClient();
  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("feed_snapshots")
    .select("id, generated_at, expires_at")
    .eq("username", USERNAME)
    .eq("feed_id", feedId)
    .gt("expires_at", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(1);

  if (snapshotError) {
    throw new Error(`Failed to read feed snapshot: ${snapshotError.message}`);
  }

  const snapshot = snapshotRows?.[0];
  if (!snapshot) return null;

  const { data: postRows, error: postError } = await supabase
    .from("feed_snapshot_posts")
    .select("post_json, position")
    .eq("snapshot_id", snapshot.id)
    .order("position", { ascending: true });

  if (postError) {
    throw new Error(`Failed to read snapshot posts: ${postError.message}`);
  }

  return {
    posts: (postRows ?? []).map((row: { post_json: RedditPost }) => row.post_json),
    generatedAt: snapshot.generated_at,
    source: "snapshot",
    failedRefreshes: [],
  };
}

interface BuildFeedSnapshotOptions {
  forceRefresh?: boolean;
}

export async function buildAndStoreFeedSnapshot(
  feedId: string,
  options: BuildFeedSnapshotOptions = {}
): Promise<FeedSnapshotResult> {
  const { posts, failedRefreshes } = await buildFeedPosts(feedId, options);
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString();
  const supabase = createClient();

  await supabase
    .from("feed_snapshots")
    .delete()
    .eq("username", USERNAME)
    .lt("expires_at", new Date().toISOString());

  const { data: snapshotInsert, error: snapshotError } = await supabase
    .from("feed_snapshots")
    .insert({
      username: USERNAME,
      feed_id: feedId,
      generated_at: generatedAt,
      expires_at: expiresAt,
      post_count: posts.length,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshotInsert) {
    throw new Error(`Failed to store feed snapshot: ${snapshotError?.message ?? "unknown error"}`);
  }

  if (posts.length > 0) {
    const { error: postError } = await supabase
      .from("feed_snapshot_posts")
      .insert(
        posts.map((post, index) => ({
          snapshot_id: snapshotInsert.id,
          position: index,
          post_id: post.id,
          subreddit: post.subreddit,
          post_json: post,
        }))
      );

    if (postError) {
      throw new Error(`Failed to store snapshot posts: ${postError.message}`);
    }
  }

  await supabase
    .from("feed_snapshots")
    .delete()
    .eq("username", USERNAME)
    .eq("feed_id", feedId)
    .lt("generated_at", generatedAt);

  return {
    posts,
    generatedAt,
    source: "rebuilt",
    failedRefreshes,
  };
}

export async function getOrBuildFeedSnapshot(feedId: string): Promise<FeedSnapshotResult> {
  const snapshot = await readLatestFeedSnapshot(feedId);
  if (snapshot) return snapshot;
  return buildAndStoreFeedSnapshot(feedId);
}

export async function buildAllFeedSnapshots(): Promise<Array<{ feedId: string; postCount: number }>> {
  const { feeds } = await getFeedDefinitions();
  const results: Array<{ feedId: string; postCount: number }> = [];

  for (const feed of feeds) {
    const snapshot = await buildAndStoreFeedSnapshot(feed.id);
    results.push({ feedId: feed.id, postCount: snapshot.posts.length });
  }

  return results;
}

export async function clearFeedSnapshot(feedId: string): Promise<{ deletedSnapshots: number }> {
  const supabase = createClient();

  const subreddits = await getFeedSubreddits(feedId);
  if (subreddits.length > 0) {
    await supabase
      .from("post_comment_counts")
      .delete()
      .in("subreddit", subreddits.map((subreddit) => normalizeSubreddit(subreddit)));
  }

  const { data, error } = await supabase
    .from("feed_snapshots")
    .delete()
    .eq("username", USERNAME)
    .eq("feed_id", feedId)
    .select("id");

  if (error) {
    throw new Error(`Failed to clear feed snapshot: ${error.message}`);
  }

  return {
    deletedSnapshots: data?.length ?? 0,
  };
}
