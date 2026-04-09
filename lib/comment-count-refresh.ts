import { fetchPostCommentCount } from "@/lib/reddit";

export interface CommentCountTarget {
  postId: string;
  subreddit: string;
}

export interface RefreshedCommentCount extends CommentCountTarget {
  numComments: number;
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
          const numComments = await fetchPostCommentCount(post.postId);
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
