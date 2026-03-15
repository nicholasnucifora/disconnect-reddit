"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Detect post detail pages: /r/[subreddit]/comments/[postId]/[slug]
  const detailMatch = pathname.match(/^\/r\/[^/]+\/comments\/([^/]+)\//);
  const postId = detailMatch?.[1] ?? null;

  async function keepInFeed() {
    if (!postId) return;

    // Remove from dismissed_posts in Supabase (fire and forget)
    const supabase = createClient();
    supabase
      .from("dismissed_posts")
      .delete()
      .eq("username", USERNAME)
      .eq("post_id", postId);

    // Signal FeedClient to re-add the post via custom event
    try {
      const cached = sessionStorage.getItem(`post:${postId}`);
      if (cached) {
        window.dispatchEvent(
          new CustomEvent("undismissPost", { detail: JSON.parse(cached) })
        );
      }
    } catch {
      // sessionStorage unavailable
    }

    router.back();
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800">
      <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link
          href="/"
          className="font-bold text-white tracking-tight hover:text-teal-400 transition-colors"
        >
          Disconnected Reddit
        </Link>

        {postId && (
          <button
            onClick={keepInFeed}
            className="text-sm text-teal-400 hover:text-teal-300 border border-teal-800 hover:border-teal-600 px-3 py-1 rounded transition-colors"
          >
            ↩ Keep in feed
          </button>
        )}
      </div>
    </nav>
  );
}
