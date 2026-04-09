import { fetchPostCommentCount } from "@/lib/reddit";

export interface CommentCountTarget {
  postId: string;
  subreddit: string;
}

export interface RefreshedCommentCount extends CommentCountTarget {
  numComments: number;
}

async function fetchPostCommentCountWithRetry(postId: string, retries = 1): Promise<number> {
  try {
    return await fetchPostCommentCount(postId);
  } catch (error) {
    if (retries <= 0) throw error;
    return fetchPostCommentCountWithRetry(postId, retries - 1);
  }
}

export async function refreshCommentCounts(
  posts: CommentCountTarget[],
  concurrency = 4
): Promise<RefreshedCommentCount[]> {
  const results: RefreshedCommentCount[] = [];
  let index = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, posts.length) }, async () => {
      while (true) {
        const currentIndex = index++;
        if (currentIndex >= posts.length) return;

        const post = posts[currentIndex];
        try {
          const numComments = await fetchPostCommentCountWithRetry(post.postId, 1);
          results.push({
            postId: post.postId,
            subreddit: post.subreddit,
            numComments,
          });
        } catch {
          // Best effort: one failed post should not kill the whole batch.
        }
      }
    })
  );

  return results;
}
