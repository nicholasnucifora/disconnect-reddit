"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUsage } from "@/lib/usage-provider";
import { formatDurationCompact } from "@/lib/usage/time";

export default function UsageGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, isBlocked, isLimitReached } = useUsage();

  if (
    pathname.startsWith("/usage") ||
    pathname.startsWith("/auth") ||
    !status ||
    (!isBlocked && !isLimitReached)
  ) {
    return <>{children}</>;
  }

  const resetSeconds = Math.max(
    0,
    Math.floor((new Date(status.dailyResetAt).getTime() - Date.now()) / 1000),
  );

  const title = isBlocked ? "Reddit is blocked right now" : "Daily Reddit limit reached";
  const description = isBlocked
    ? status.nextWindowOpensAt
      ? `Your next scheduled browsing window opens at ${new Intl.DateTimeFormat([], {
          timeZone: status.timezone,
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(status.nextWindowOpensAt))}.`
      : "There are no more scheduled browsing windows left today."
    : `Your allowance resets in ${formatDurationCompact(resetSeconds)}.`;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-20 blur-[1px]">{children}</div>
      <div className="absolute inset-0 z-20 flex items-start justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-xl rounded-2xl border border-red-500/30 bg-gray-950/95 p-6 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">
            Usage restriction
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-gray-300">{description}</p>
          <div className="mt-5 flex items-center gap-3">
            <Link
              href="/usage"
              className="rounded-full bg-teal-400 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-teal-300"
            >
              Open usage history
            </Link>
            <p className="text-xs text-gray-500">
              Schedule windows and daily allowance are enforced separately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
