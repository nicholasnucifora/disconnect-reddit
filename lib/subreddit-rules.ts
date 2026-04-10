export const DEFAULT_SUBREDDIT_MAX_POSTS = 100;
export const MAX_SUBREDDIT_MAX_POSTS = 100;
export const DEFAULT_SUBREDDIT_MIN_COMMENTS = 0;

export interface SubredditRule {
  subreddit: string;
  maxPosts: number;
  minComments: number;
}

export function normalizeSubreddit(name: string): string {
  return name.trim().replace(/^r\//i, "").toLowerCase();
}

export function sanitizeSubredditMaxPosts(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SUBREDDIT_MAX_POSTS;
  return Math.max(1, Math.min(MAX_SUBREDDIT_MAX_POSTS, Math.round(value as number)));
}

export function sanitizeSubredditMinComments(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SUBREDDIT_MIN_COMMENTS;
  return Math.max(0, Math.round(value as number));
}

export function createDefaultSubredditRule(subreddit: string): SubredditRule {
  return {
    subreddit: normalizeSubreddit(subreddit),
    maxPosts: DEFAULT_SUBREDDIT_MAX_POSTS,
    minComments: DEFAULT_SUBREDDIT_MIN_COMMENTS,
  };
}

export function mapSubredditRuleRow(row: {
  subreddit: string;
  max_posts?: number | null;
  min_comments?: number | null;
}): SubredditRule {
  return {
    subreddit: normalizeSubreddit(row.subreddit),
    maxPosts: sanitizeSubredditMaxPosts(row.max_posts),
    minComments: sanitizeSubredditMinComments(row.min_comments),
  };
}

export function createSubredditRuleMap(rules: SubredditRule[]): Map<string, SubredditRule> {
  return new Map(rules.map((rule) => [normalizeSubreddit(rule.subreddit), rule]));
}
