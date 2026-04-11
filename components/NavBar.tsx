"use client";

import Link from "next/link";
import { useUsage } from "@/lib/usage-provider";

interface NavBarProps {
  onMenuClick?: () => void;
}

export default function NavBar({ onMenuClick }: NavBarProps) {
  const { headerLabel, headerSecondaryLabel, headerTone, progressPercent } = useUsage();

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
          outer: "border-gray-800 bg-gray-900/80",
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
            className="min-w-0 truncate pr-1 text-xs font-bold tracking-tight text-white transition-colors hover:text-teal-400 sm:text-sm md:pr-0 md:text-2xl"
          >
            Disconnected Reddit
          </Link>
        </div>

        <div
          className={`w-[8rem] flex-shrink-0 rounded-lg border px-2 py-1.5 md:w-[16rem] md:rounded-xl md:px-3 ${pillTone.outer}`}
          aria-label={headerLabel ?? "Loading"}
        >
          <div className={`truncate text-[11px] font-medium ${pillTone.text} md:text-sm`}>
            {headerLabel ?? "Loading"}
          </div>
          {headerSecondaryLabel && (
            <div className="mt-0.5 truncate text-[10px] text-gray-400 md:text-xs">
              {headerSecondaryLabel}
            </div>
          )}
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-800 md:mt-2 md:h-1.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${pillTone.bar}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
