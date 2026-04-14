export const DEFAULT_SUBREDDIT_MAX_POSTS = 100;
export const MAX_SUBREDDIT_MAX_POSTS = 100;
export const DEFAULT_SUBREDDIT_MIN_COMMENTS = 0;
export const SUBREDDIT_CANDIDATE_FETCH_LIMIT = 100;

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

export function sortPostsByActivity<T extends { numComments: number; createdUtc: number }>(
  posts: T[]
): T[] {
  return [...posts].sort((a, b) => {
    if (b.numComments !== a.numComments) return b.numComments - a.numComments;
    return b.createdUtc - a.createdUtc;
  });
}

export function applySubredditRuleCaps<
  T extends { subreddit: string; numComments: number; createdUtc: number }
>(posts: T[], ruleMap: Map<string, SubredditRule>): T[] {
  const postsBySubreddit = new Map<string, T[]>();

  for (const post of posts) {
    const normalized = normalizeSubreddit(post.subreddit);
    const existing = postsBySubreddit.get(normalized);
    if (existing) existing.push(post);
    else postsBySubreddit.set(normalized, [post]);
  }

  const cappedPosts: T[] = [];
  for (const [subreddit, subredditPosts] of Array.from(postsBySubreddit.entries())) {
    const rule = ruleMap.get(subreddit);
    const minComments = rule?.minComments ?? DEFAULT_SUBREDDIT_MIN_COMMENTS;
    const maxPosts = rule?.maxPosts ?? DEFAULT_SUBREDDIT_MAX_POSTS;

    cappedPosts.push(
      ...sortPostsByActivity(subredditPosts)
        .filter((post) => post.numComments >= minComments)
        .slice(0, maxPosts)
    );
  }

  return sortPostsByActivity(cappedPosts);
}
