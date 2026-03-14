import { NextRequest, NextResponse } from "next/server";
import { fetchMoreComments } from "@/lib/reddit";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const subreddit = searchParams.get("subreddit");
  const postId = searchParams.get("postId");
  const commentId = searchParams.get("commentId");

  if (!subreddit || !postId || !commentId) {
    return NextResponse.json(
      { error: "Missing required query params: subreddit, postId, commentId" },
      { status: 400 }
    );
  }

  try {
    const comments = await fetchMoreComments(subreddit, postId, commentId);

    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
