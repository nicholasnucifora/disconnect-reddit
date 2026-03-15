import { NextResponse } from "next/server";

export const runtime = "edge";

// "Load more" comments are not supported — Arctic Shift fetches up to 100 comments
// in the initial load. This route is kept to avoid 404s from the Comment component.
export async function GET() {
  return NextResponse.json({ comments: [] });
}
