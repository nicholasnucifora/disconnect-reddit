"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";
import { useUsage } from "@/lib/usage-provider";

interface NavBarProps {
  onMenuClick?: () => void;
}

export default function NavBar({ onMenuClick }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { headerLabel, headerTone, progressPercent } = useUsage();

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
          new CustomEvent("undismissPost", { detail: JSON.parse(cached) }),
        );
      }
    } catch {
      // sessionStorage unavailable
    }

    router.back();
  }

  const pillTone =
    headerTone === "danger"
      ? {
          outer: "border-red-500/40 bg-red-500/10",
          text: "text-red-300",
          bar: "bg-red-400",
        }
      : headerTone === "warning"
      ? {
          outer: "border-amber-400/40 bg-amber-400/10",
          text: "text-amber-200",
          bar: "bg-amber-400",
        }
      : {
          outer: "border-gray-800 bg-gray-900/80 hover:border-gray-700",
          text: "text-gray-200",
          bar: "bg-teal-400",
        };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-gray-800 bg-gray-950">
      <div className="flex h-full items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-1 text-gray-400 transition-colors hover:text-gray-100 md:hidden"
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
            className="font-bold text-2xl tracking-tight text-white transition-colors hover:text-teal-400"
          >
            Disconnected Reddit
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/usage"
            className={`min-w-[11rem] rounded-xl border px-3 py-2 transition-colors ${pillTone.outer}`}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Reddit today
              </span>
              <span className={`text-sm font-medium ${pillTone.text}`}>
                {headerLabel ?? "Loading"}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${pillTone.bar}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </Link>

          {postId && (
            <button
              onClick={keepInFeed}
              className="rounded border border-teal-800 px-4 py-1.5 text-base text-teal-400 transition-colors hover:border-teal-600 hover:text-teal-300"
            >
              Keep in feed
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
