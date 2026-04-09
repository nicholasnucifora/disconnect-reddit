"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUsage } from "@/lib/usage-provider";

interface NavBarProps {
  onMenuClick?: () => void;
}

export default function NavBar({ onMenuClick }: NavBarProps) {
  const { headerLabel, headerTone, progressPercent } = useUsage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <nav className="fixed left-0 right-0 top-0 z-50 h-14 overflow-hidden border-b border-gray-800 bg-gray-950 md:h-16">
      <div className="flex h-full items-center gap-2 overflow-hidden px-3 sm:px-4 md:gap-4 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <button
            onClick={onMenuClick}
            className="flex-shrink-0 p-1 text-gray-400 transition-colors hover:text-gray-100 md:hidden"
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
            className="min-w-0 truncate pr-1 text-sm font-bold tracking-tight text-white transition-colors hover:text-teal-400 sm:text-base md:pr-0 md:text-2xl"
          >
            Disconnected Reddit
          </Link>
        </div>

        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setOpen((value) => !value)}
            className={`w-[7.5rem] max-w-full rounded-lg border px-2 py-1.5 text-left transition-colors sm:w-[8.5rem] md:w-[17rem] md:rounded-xl md:px-3 ${pillTone.outer}`}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 md:hidden">
                  Today
                </span>
                <span className="hidden truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 md:block">
                  Reddit today
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
                <span
                  className={`max-w-[4.25rem] truncate text-[11px] font-medium ${pillTone.text} sm:max-w-[5rem] sm:text-xs md:max-w-none md:text-sm`}
                >
                  {headerLabel ?? "Loading"}
                </span>
                <span className="flex-shrink-0 text-xs text-gray-500 sm:text-sm">Menu</span>
              </div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-800 md:mt-3 md:h-1.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${pillTone.bar}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </button>

          {open && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] w-[14rem] rounded-2xl border border-gray-800 bg-gray-900 p-2 shadow-2xl md:left-0 md:right-0 md:w-auto">
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
    </nav>
  );
}
