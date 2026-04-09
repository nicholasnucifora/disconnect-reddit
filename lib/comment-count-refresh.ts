import { fetchPostCommentCount, fetchPostScore } from "@/lib/reddit";

export interface CommentCountTarget {
  postId: string;
  subreddit: string;
}

export interface RefreshedCommentCount extends CommentCountTarget {
  numComments: number;
  score: number;
}

export interface FailedCommentCountRefresh extends CommentCountTarget {
  error: string;
}

export interface CommentCountRefreshResult {
  refreshed: RefreshedCommentCount[];
  failed: FailedCommentCountRefresh[];
}

async function fetchPostCommentCountWithRetry(postId: string, retries = 1): Promise<number> {
  try {
    return await fetchPostCommentCount(postId);
  } catch (error) {
    if (retries <= 0) throw error;
    return fetchPostCommentCountWithRetry(postId, retries - 1);
  }
}

async function fetchPostScoreWithRetry(postId: string, retries = 1): Promise<number> {
  try {
    return await fetchPostScore(postId);
  } catch (error) {
    if (retries <= 0) throw error;
    return fetchPostScoreWithRetry(postId, retries - 1);
  }
}

export async function refreshCommentCounts(
  posts: CommentCountTarget[],
  concurrency = 4
): Promise<CommentCountRefreshResult> {
  const refreshed: RefreshedCommentCount[] = [];
  const failed: FailedCommentCountRefresh[] = [];
  let index = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, posts.length) }, async () => {
      while (true) {
        const currentIndex = index++;
        if (currentIndex >= posts.length) return;

        const post = posts[currentIndex];
        try {
          const [numComments, score] = await Promise.all([
            fetchPostCommentCountWithRetry(post.postId, 1),
            fetchPostScoreWithRetry(post.postId, 1),
          ]);
          refreshed.push({
            postId: post.postId,
            subreddit: post.subreddit,
            numComments,
            score,
          });
        } catch (error) {
          failed.push({
            postId: post.postId,
            subreddit: post.subreddit,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    })
  );

  return { refreshed, failed };
}
