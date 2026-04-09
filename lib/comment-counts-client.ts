import { RedditPost } from "@/lib/reddit";

export async function hydratePostsWithCommentCounts(posts: RedditPost[]): Promise<RedditPost[]> {
  if (posts.length === 0) return posts;

  const visiblePosts = posts.slice(0, 24).map((post) => ({
    postId: post.id,
    subreddit: post.subreddit,
  }));

  try {
    const res = await fetch("/api/reddit/comment-counts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ posts: visiblePosts }),
    });

    if (!res.ok) return posts;

    const data = await res.json();
    const counts = data.counts ?? {};

    return posts.map((post) => {
      const correctedCount = counts[post.id];
      if (typeof correctedCount !== "number" || correctedCount <= post.numComments) {
        return post;
      }
      return { ...post, numComments: correctedCount };
    });
  } catch {
    return posts;
  }
}
