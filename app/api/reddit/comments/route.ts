import { NextRequest, NextResponse } from "next/server";
import { fetchPostComments } from "@/lib/reddit";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const subreddit = searchParams.get("subreddit");
  const postId = searchParams.get("postId");
  const slug = searchParams.get("slug") ?? postId ?? "";

  if (!subreddit || !postId) {
    return NextResponse.json(
      { error: "Missing required query params: subreddit, postId" },
      { status: 400 }
    );
  }

  try {
    const commentTree = await fetchPostComments(subreddit, postId, slug);

    return NextResponse.json(commentTree, {
      headers: {
        "Cache-Control": "public, s-maxage=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
