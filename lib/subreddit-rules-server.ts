import { USERNAME } from "@/lib/config";
import {
  createSubredditRuleMap,
  mapSubredditRuleRow,
  type SubredditRule,
} from "@/lib/subreddit-rules";
import { createClient } from "@/lib/supabase/server";

export async function loadUserSubredditRules(): Promise<SubredditRule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_subreddits")
    .select("subreddit, max_posts, min_comments")
    .eq("username", USERNAME)
    .order("added_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load subreddit rules: ${error.message}`);
  }

  return (data ?? []).map(
    (row: { subreddit: string; max_posts: number | null; min_comments: number | null }) =>
      mapSubredditRuleRow(row)
  );
}

export async function loadUserSubredditRuleMap(): Promise<Map<string, SubredditRule>> {
  return createSubredditRuleMap(await loadUserSubredditRules());
}
