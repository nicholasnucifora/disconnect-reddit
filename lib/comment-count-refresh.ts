import { fetchPostMetricsByIds } from "@/lib/reddit";

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

async function fetchPostMetricsWithRetry(postIds: string[], retries = 1) {
  try {
    return await fetchPostMetricsByIds(postIds);
  } catch (error) {
    if (retries <= 0) throw error;
    return fetchPostMetricsWithRetry(postIds, retries - 1);
  }
}

export async function refreshCommentCounts(
  posts: CommentCountTarget[],
  concurrency = 4
): Promise<CommentCountRefreshResult> {
  void concurrency;

  if (posts.length === 0) {
    return { refreshed: [], failed: [] };
  }

  const refreshed: RefreshedCommentCount[] = [];
  const failed: FailedCommentCountRefresh[] = [];
  const normalizedPosts = posts.map((post) => ({
    ...post,
    normalizedPostId: post.postId.trim(),
  }));
  const batchSize = 500;

  for (let index = 0; index < normalizedPosts.length; index += batchSize) {
    const batch = normalizedPosts.slice(index, index + batchSize);
    const batchIds = Array.from(new Set(batch.map((post) => post.normalizedPostId)));

    try {
      const metricsById = await fetchPostMetricsWithRetry(batchIds, 1);

      for (const post of batch) {
        const metrics = metricsById.get(post.normalizedPostId);
        if (!metrics) {
          failed.push({
            postId: post.postId,
            subreddit: post.subreddit,
            error: `Post ${post.postId} was missing from Arctic Shift posts/ids response`,
          });
          continue;
        }

        refreshed.push({
          postId: post.postId,
          subreddit: post.subreddit,
          numComments: metrics.numComments,
          score: metrics.score,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      for (const post of batch) {
        failed.push({
          postId: post.postId,
          subreddit: post.subreddit,
          error: message,
        });
      }
    }
  }

  return { refreshed, failed };
}
