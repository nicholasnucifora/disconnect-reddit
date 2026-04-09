"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const detailMatch = pathname.match(/^\/r\/[^/]+\/comments\/([^/]+)\//);
  const postId = detailMatch?.[1] ?? null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function keepInFeed() {
    if (!postId) return;

    const supabase = createClient();
    void supabase
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
        window.dispatchEvent(new CustomEvent("undismissPost", { detail: JSON.parse(cached) }));
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
          text: "text-gray-100",
          bar: "bg-teal-400",
        };

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-gray-800 bg-gray-950">
      <div className="grid h-full grid-cols-[auto_1fr_auto] items-center gap-4 px-5">
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

        <div className="flex justify-center">
          <div className="relative w-full max-w-sm" ref={menuRef}>
            <button
              onClick={() => setOpen((value) => !value)}
              className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${pillTone.outer}`}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm text-gray-500">⚙</span>
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Reddit today
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${pillTone.text}`}>
                    {headerLabel ?? "Loading"}
                  </span>
                  <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${pillTone.bar}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Click for watch time and settings
              </div>
            </button>

            {open && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] rounded-2xl border border-gray-800 bg-gray-900 p-2 shadow-2xl">
                <Link
                  href="/watch-time"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-gray-200 transition-colors hover:bg-gray-800"
                >
                  <span>Watch Time</span>
                  <span className="text-gray-500">Usage history</span>
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="mt-1 flex items-center justify-between rounded-xl px-4 py-3 text-sm text-gray-200 transition-colors hover:bg-gray-800"
                >
                  <span>Settings</span>
                  <span className="text-gray-500">Limit and schedules</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
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
