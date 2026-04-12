"use client";

import { useEffect, useState } from "react";

const MOBILE_VIEWPORT_MEDIA_QUERY = "(max-width: 767px)";

function getIsMobileViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches;
}

export function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    const update = () => setIsMobileViewport(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobileViewport;
}
