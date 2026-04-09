import { createClient } from "@/lib/supabase/server";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedCommentCount {
  postId: string;
  subreddit: string;
  numComments: number;
  score: number;
  checkedAt: string;
  expiresAt: string;
}

export interface CommentCountUpsert {
  postId: string;
  subreddit: string;
  numComments: number;
  score: number;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || error?.message?.includes("post_comment_counts") === true;
}

export function isCommentCountStale(entry: CachedCommentCount): boolean {
  return Date.now() - new Date(entry.checkedAt).getTime() >= REFRESH_INTERVAL_MS;
}

export async function getCachedCommentCounts(postIds: string[]): Promise<Map<string, CachedCommentCount>> {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
  if (uniquePostIds.length === 0) return new Map();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("post_comment_counts")
    .select("post_id, subreddit, num_comments, score, checked_at, expires_at")
    .in("post_id", uniquePostIds)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    if (isMissingTableError(error)) return new Map();
    throw new Error(`Failed to read cached comment counts: ${error.message}`);
  }

  const entries = (data ?? []).map((row: {
    post_id: string;
    subreddit: string;
    num_comments: number;
    score?: number;
    checked_at: string;
    expires_at: string;
  }) => [
    row.post_id,
    {
      postId: row.post_id,
      subreddit: row.subreddit,
      numComments: row.num_comments,
      score: row.score ?? 0,
      checkedAt: row.checked_at,
      expiresAt: row.expires_at,
    } satisfies CachedCommentCount,
  ] as const);

  return new Map(entries);
}

export async function upsertCommentCounts(entries: CommentCountUpsert[]): Promise<void> {
  if (entries.length === 0) return;

  const now = Date.now();
  const payload = entries.map((entry) => ({
    post_id: entry.postId,
    subreddit: entry.subreddit,
    num_comments: entry.numComments,
    score: entry.score,
    checked_at: new Date(now).toISOString(),
    expires_at: new Date(now + EXPIRY_WINDOW_MS).toISOString(),
  }));

  const supabase = createClient();
  const { error } = await supabase
    .from("post_comment_counts")
    .upsert(payload, { onConflict: "post_id" });

  if (error) {
    if (isMissingTableError(error)) return;
    throw new Error(`Failed to cache comment counts: ${error.message}`);
  }
}

export async function cleanupExpiredCommentCounts(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("post_comment_counts")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to clean cached comment counts: ${error.message}`);
  }
}
