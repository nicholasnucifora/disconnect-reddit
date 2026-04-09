"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function shouldBypass(pathname: string) {
  return pathname.startsWith("/auth");
}

export default function FocusGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isFocused, setIsFocused] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    const handleVisibility = () => setIsVisible(document.visibilityState === "visible");

    handleVisibility();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const showOverlay = !shouldBypass(pathname) && isVisible && !isFocused;

  useEffect(() => {
    if (!showOverlay) return;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScroll as EventListener, { passive: false });

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScroll as EventListener);
    };
  }, [showOverlay]);

  return (
    <div className="relative min-h-screen">
      <div
        className={
          showOverlay
            ? "pointer-events-none select-none blur-xl grayscale-[0.7] brightness-75"
            : ""
        }
      >
        {children}
      </div>
      {showOverlay && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/88 backdrop-blur-md">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/95 px-6 py-5 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Focus required
            </p>
            <p className="mt-3 text-lg font-medium text-white">
              Bring Disconnected Reddit into focus to keep browsing.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Time only counts while this window is focused.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
