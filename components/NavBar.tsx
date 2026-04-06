"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";

interface NavBarProps {
  onMenuClick?: () => void;
}

export default function NavBar({ onMenuClick }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const detailMatch = pathname.match(/^\/r\/[^/]+\/comments\/([^/]+)\//);
  const postId = detailMatch?.[1] ?? null;

  async function keepInFeed() {
    if (!postId) return;

    const supabase = createClient();
    supabase
      .from("dismissed_posts")
      .delete()
      .eq("username", USERNAME)
      .eq("post_id", postId);

    try {
      const local: string[] = JSON.parse(sessionStorage.getItem("localDismissed") ?? "[]");
      const updated = local.filter((id) => id !== postId);
      sessionStorage.setItem("localDismissed", JSON.stringify(updated));

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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800 h-16">
      <div className="h-full flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={onMenuClick}
            className="md:hidden text-gray-400 hover:text-gray-100 transition-colors p-1 -ml-1"
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1" />
              <rect y="9" width="20" height="2" rx="1" />
              <rect y="15" width="20" height="2" rx="1" />
            </svg>
          </button>
          <Link
            href="/"
            className="font-bold text-2xl text-white tracking-tight hover:text-teal-400 transition-colors"
          >
            Disconnected Reddit
          </Link>
        </div>

        {postId && (
          <button
            onClick={keepInFeed}
            className="text-base text-teal-400 hover:text-teal-300 border border-teal-800 hover:border-teal-600 px-4 py-1.5 rounded transition-colors"
          >
            ↩ Keep in feed
          </button>
        )}
      </div>
    </nav>
  );
}
