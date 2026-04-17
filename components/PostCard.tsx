"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RedditPost } from "@/lib/reddit";
import { useSavedPosts } from "@/lib/saved-posts";

const CARD_SWIPE_TRIGGER = 72;
const CARD_SWIPE_NEUTRAL_ZONE = 22;
const SWIPE_CLICK_SUPPRESSION_MS = 250;

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isDirectImage(url: string, domain: string): boolean {
  return (
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
    domain === "i.redd.it" ||
    domain === "i.imgur.com"
  );
}

interface PostCardProps {
  post: RedditPost;
  onDismiss?: (id: string) => void;
  view?: "default" | "saved";
}

export default function PostCard({ post, onDismiss, view = "default" }: PostCardProps) {
  const router = useRouter();
  const articleRef = useRef<HTMLElement | null>(null);
  const galleryRubberbandTimeoutRef = useRef<number | null>(null);
  const swipeOffsetRef = useRef(0);
  const cardTouchStartXRef = useRef<number | null>(null);
  const cardTouchStartYRef = useRef<number | null>(null);
  const cardSwipeActiveRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  const [clicked, setClicked] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [resolvedNumComments, setResolvedNumComments] = useState(post.numComments);
  const [galleryTouchStartX, setGalleryTouchStartX] = useState<number | null>(null);
  const [galleryTouchDeltaX, setGalleryTouchDeltaX] = useState(0);
  const [galleryRubberbandOffset, setGalleryRubberbandOffset] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);

  const { isSaved, save, unsave } = useSavedPosts();
  const slug = post.permalink.split("/").filter(Boolean).pop() ?? post.id;
  const detailUrl = `/r/${post.subreddit}/comments/${post.id}/${slug}`;
  const redditUrl = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/${slug}/`;
  const saved = isSaved(post.id);
  const isSavedView = view === "saved";
  const canSaveFromHere = !isSavedView && !saved;
  const canDismiss = isSavedView || Boolean(onDismiss) || saved;

  useEffect(() => {
    router.prefetch(detailUrl);
    try {
      const cachedRaw = localStorage.getItem(`post:${post.id}`);
      const cachedPost = cachedRaw ? (JSON.parse(cachedRaw) as RedditPost) : null;
      const mergedNumComments = Math.max(post.numComments, cachedPost?.numComments ?? 0);
      setResolvedNumComments(mergedNumComments);
      localStorage.setItem(
        `post:${post.id}`,
        JSON.stringify(
          mergedNumComments === post.numComments
            ? post
            : { ...post, numComments: mergedNumComments }
        )
      );
    } catch {
      // storage unavailable
    }
  }, [router, detailUrl, post]);

  useEffect(() => {
    return () => {
      if (galleryRubberbandTimeoutRef.current !== null) {
        window.clearTimeout(galleryRubberbandTimeoutRef.current);
      }
    };
  }, []);

  function updateSwipeVisual(offset: number) {
    swipeOffsetRef.current = offset;
    setSwipeOffset(offset);
  }

  function resetSwipeVisual() {
    updateSwipeVisual(0);
    setSwipeDragging(false);
  }

  function shouldDismissOnOpen() {
    return Boolean(onDismiss) && window.matchMedia("(min-width: 768px)").matches;
  }

  function navigateToPost() {
    const dismissOnOpen = shouldDismissOnOpen();
    if (
      (dismissOnOpen && clicked) ||
      cardSwipeActiveRef.current ||
      Math.abs(swipeOffsetRef.current) > 8 ||
      Date.now() < suppressClickUntilRef.current
    ) {
      return;
    }
    if (dismissOnOpen) {
      setClicked(true);
      void onDismiss?.(post.id);
    }
    router.push(detailUrl);
  }

  function handleArticleClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "a, button, input, textarea, select, summary, details, [role='button'], [data-card-swipe-ignore='true']"
      )
    ) {
      return;
    }
    navigateToPost();
  }

  function handleDismiss() {
    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    if (isSavedView) {
      unsave(post.id);
      return;
    }

    if (onDismiss) {
      void onDismiss(post.id);
      return;
    }

    if (isSaved(post.id)) {
      unsave(post.id);
    }
  }

  function handleSaveAction() {
    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    if (isSavedView) {
      unsave(post.id);
      return;
    }

    if (saved) {
      unsave(post.id);
      return;
    }

    save(post);
    if (onDismiss) {
      void onDismiss(post.id);
    }
  }

  const hasGallery = post.isGallery && post.galleryImages.length > 0;
  const isImage = !post.isGallery && isDirectImage(post.url, post.domain);
  const showLargeMedia = hasGallery || isImage;
  const images = hasGallery
    ? post.galleryImages.map((galleryImage) => galleryImage.url)
    : isImage
    ? [post.url]
    : [];
  const hasThumbnail = !showLargeMedia && !!post.thumbnail;
  const isMultiImageGallery = images.length > 1;
  const galleryTranslate = `calc(${-imgIndex * 100}% + ${galleryTouchDeltaX + galleryRubberbandOffset}px)`;

  function triggerGalleryRubberband(direction: "start" | "end") {
    if (!isMultiImageGallery) return;
    if (galleryRubberbandTimeoutRef.current !== null) {
      window.clearTimeout(galleryRubberbandTimeoutRef.current);
    }
    setGalleryRubberbandOffset(direction === "start" ? 18 : -18);
    galleryRubberbandTimeoutRef.current = window.setTimeout(() => {
      setGalleryRubberbandOffset(0);
      galleryRubberbandTimeoutRef.current = null;
    }, 160);
  }

  function prevImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => {
      if (index === 0) {
        triggerGalleryRubberband("start");
        return index;
      }
      return index - 1;
    });
  }

  function nextImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => {
      if (index === images.length - 1) {
        triggerGalleryRubberband("end");
        return index;
      }
      return index + 1;
    });
  }

  function handleGalleryTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (!isMultiImageGallery) return;
    if (galleryRubberbandTimeoutRef.current !== null) {
      window.clearTimeout(galleryRubberbandTimeoutRef.current);
      galleryRubberbandTimeoutRef.current = null;
    }
    setGalleryTouchStartX(event.touches[0]?.clientX ?? null);
    setGalleryTouchDeltaX(0);
    setGalleryRubberbandOffset(0);
  }

  function handleGalleryTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (galleryTouchStartX === null || !isMultiImageGallery) return;
    const currentX = event.touches[0]?.clientX ?? galleryTouchStartX;
    const deltaX = currentX - galleryTouchStartX;
    const isPullingPastStart = imgIndex === 0 && deltaX > 0;
    const isPullingPastEnd = imgIndex === images.length - 1 && deltaX < 0;
    setGalleryTouchDeltaX(
      isPullingPastStart || isPullingPastEnd ? Math.round(deltaX * 0.18) : deltaX
    );
  }

  function handleGalleryTouchEnd() {
    if (galleryTouchStartX === null || !isMultiImageGallery) return;
    if (galleryTouchDeltaX <= -40) {
      setImgIndex((index) => {
        if (index === images.length - 1) {
          triggerGalleryRubberband("end");
          return index;
        }
        return index + 1;
      });
    } else if (galleryTouchDeltaX >= 40) {
      setImgIndex((index) => {
        if (index === 0) {
          triggerGalleryRubberband("start");
          return index;
        }
        return index - 1;
      });
    }
    setGalleryTouchStartX(null);
    setGalleryTouchDeltaX(0);
  }

  function handleCardTouchStart(event: React.TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-card-swipe-ignore='true']")) return;
    if (isMultiImageGallery && target?.closest("[data-gallery-swipe='true']")) return;
    const touch = event.touches[0];
    if (!touch) return;
    cardTouchStartXRef.current = touch.clientX;
    cardTouchStartYRef.current = touch.clientY;
    cardSwipeActiveRef.current = false;
    resetSwipeVisual();
  }

  function handleCardTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (cardTouchStartXRef.current === null || cardTouchStartYRef.current === null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - cardTouchStartXRef.current;
    const deltaY = touch.clientY - cardTouchStartYRef.current;

    if (!cardSwipeActiveRef.current && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      cardTouchStartXRef.current = null;
      cardTouchStartYRef.current = null;
      resetSwipeVisual();
      return;
    }

    cardSwipeActiveRef.current = true;
    setSwipeDragging(true);
    event.preventDefault();
    const articleWidth = articleRef.current?.getBoundingClientRect().width ?? 0;
    const maxOffset = Math.max(CARD_SWIPE_TRIGGER, articleWidth / 2 - 44);
    const offset = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    updateSwipeVisual(offset);
  }

  function handleCardTouchEnd() {
    const finalOffset = swipeOffsetRef.current;
    const wasSwipe = cardSwipeActiveRef.current;

    cardTouchStartXRef.current = null;
    cardTouchStartYRef.current = null;
    cardSwipeActiveRef.current = false;
    resetSwipeVisual();

    if (!wasSwipe) return;

    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;

    if (finalOffset <= -CARD_SWIPE_TRIGGER) {
      handleDismiss();
      return;
    }

    if (finalOffset >= CARD_SWIPE_TRIGGER) {
      if (isSavedView) {
        handleDismiss();
        return;
      }

      if (canSaveFromHere) {
        handleSaveAction();
      }
    }
  }

  function handleCardTouchCancel() {
    cardTouchStartXRef.current = null;
    cardTouchStartYRef.current = null;
    cardSwipeActiveRef.current = false;
    resetSwipeVisual();
  }

  function handleToggleSaved(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleSaveAction();
  }

  function handleDismissClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleDismiss();
  }

  const swipeDistance = Math.abs(swipeOffset);
  const swipeActivationDistance = Math.max(0, swipeDistance - CARD_SWIPE_NEUTRAL_ZONE);
  const swipeProgress = Math.min(1, swipeActivationDistance / CARD_SWIPE_TRIGGER);
  const activeSwipeAction =
    swipeOffset > CARD_SWIPE_NEUTRAL_ZONE && isSavedView
      ? "dismiss"
      : swipeOffset > CARD_SWIPE_NEUTRAL_ZONE && canSaveFromHere
      ? "save"
      : swipeOffset < -CARD_SWIPE_NEUTRAL_ZONE && canDismiss
      ? "dismiss"
      : "none";
  const swipeVisualProgress =
    swipeProgress <= 0 ? 0 : Math.min(1, Math.pow(swipeProgress, 0.85));
  const swipeOverlayTint =
    activeSwipeAction === "save"
      ? `rgba(245, 158, 11, ${0.06 + swipeVisualProgress * 0.26})`
      : activeSwipeAction === "dismiss"
      ? `rgba(239, 68, 68, ${0.06 + swipeVisualProgress * 0.26})`
      : "rgba(17, 24, 39, 0)";
  const swipeBadgeClasses =
    activeSwipeAction === "save"
      ? "border-amber-400/70 bg-amber-400/20 text-amber-200"
      : activeSwipeAction === "dismiss"
      ? "border-red-400/70 bg-red-400/20 text-red-200"
      : "border-gray-700/0 bg-gray-900/0 text-transparent";
  const swipeBadgeSymbol =
    activeSwipeAction === "save" ? "\u2605" : activeSwipeAction === "dismiss" ? "\u2715" : "";
  const actionButtons = (
    <div className={`${isMultiImageGallery ? "flex" : "hidden"} items-center gap-2 md:flex`}>
      {!isSavedView && (
        <button
          type="button"
          onClick={handleToggleSaved}
          data-card-swipe-ignore="true"
          aria-label={saved ? "Remove from saved posts" : "Save post"}
          title={saved ? "Saved" : "Save post"}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-xl transition-colors ${
            saved
              ? "border-amber-400/60 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
              : "border-gray-700 bg-gray-800 text-gray-400 hover:border-amber-400/50 hover:text-amber-300"
          }`}
        >
          {saved ? "\u2605" : "\u2606"}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismissClick}
        data-card-swipe-ignore="true"
        aria-label={canDismiss ? "Remove post" : "Remove unavailable"}
        title={canDismiss ? "Remove post" : "Remove unavailable"}
        disabled={!canDismiss}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-lg transition-colors ${
          canDismiss
            ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            : "border-gray-700 bg-gray-800 text-gray-600"
        }`}
      >
        {"\u2715"}
      </button>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 rounded-lg transition-[background-color] duration-150"
          style={{
            backgroundColor: swipeOverlayTint,
            transitionDuration: swipeDragging ? "0ms" : "150ms",
          }}
        />
        <div
          className={`absolute top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border text-3xl shadow-lg backdrop-blur-sm transition-[left,opacity,transform,background-color,border-color,color] duration-150 ${swipeBadgeClasses}`}
          style={{
            left: `calc(50% + ${swipeOffset}px)`,
            opacity: swipeVisualProgress,
            transform: `translate(-50%, -50%) scale(${0.68 + swipeVisualProgress * 0.4})`,
            transitionDuration: swipeDragging ? "0ms" : "150ms",
          }}
        >
          {swipeBadgeSymbol}
        </div>
      </div>

      <article
        ref={articleRef}
        className={`relative rounded-lg border border-gray-800 bg-gray-900 transition-opacity duration-150 ${
          clicked ? "opacity-50" : ""
        }`}
        style={{ touchAction: "pan-y" }}
        onClick={handleArticleClick}
        onTouchStart={handleCardTouchStart}
        onTouchMove={handleCardTouchMove}
        onTouchEnd={handleCardTouchEnd}
        onTouchCancel={handleCardTouchCancel}
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <span className="text-sm font-semibold uppercase tracking-wide text-indigo-400">
                    r/{post.subreddit}
                  </span>
                  {post.flair && (
                    <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
                      {post.flair}
                    </span>
                  )}
                </div>
                {!hasThumbnail && actionButtons}
              </div>

              <button
                type="button"
                onClick={navigateToPost}
                className="mb-2 block text-left text-lg font-semibold leading-snug text-gray-100 transition-colors hover:text-indigo-300 sm:text-xl"
              >
                {post.title}
              </button>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 sm:text-base">
                <span>by u/{post.author}</span>
                <span>{timeAgo(post.createdUtc)}</span>
                {!post.isSelf && <span className="italic text-gray-600">{post.domain}</span>}
              </div>
            </div>

            {hasThumbnail && (
              <div className="flex flex-shrink-0 flex-col items-end gap-3">
                {actionButtons}
                <button type="button" onClick={navigateToPost} className="mt-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.thumbnail!}
                    alt=""
                    className="h-16 w-20 rounded bg-gray-800 object-cover sm:h-20 sm:w-28"
                  />
                </button>
              </div>
            )}
          </div>

          {post.isSelf && post.selftext && (
            <p className="mt-3 line-clamp-5 whitespace-pre-line text-base leading-relaxed text-gray-400">
              {post.selftext
                .replace(/!\[.*?\]\(.*?\)/g, "")
                .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
                .replace(/#{1,6}\s+/g, "")
                .replace(/[*_~`]/g, "")
                .replace(/^\s*[-*+]\s+/gm, "")
                .replace(/^\s*\d+\.\s+/gm, "")
                .replace(/^>\s*/gm, "")
                .replace(/\n{3,}/g, "\n\n")
                .trim()}
            </p>
          )}

          {showLargeMedia && images.length > 0 && (
            <div
              className="relative mt-4 select-none overflow-hidden rounded-lg bg-gray-800"
              data-gallery-swipe={isMultiImageGallery ? "true" : undefined}
              onTouchStart={handleGalleryTouchStart}
              onTouchMove={handleGalleryTouchMove}
              onTouchEnd={handleGalleryTouchEnd}
              onTouchCancel={handleGalleryTouchEnd}
              style={isMultiImageGallery ? { touchAction: "pan-y" } : undefined}
            >
              <div
                className={`flex ${galleryTouchStartX === null ? "transition-transform duration-200 ease-out" : ""}`}
                style={{ transform: `translateX(${galleryTranslate})` }}
              >
                {images.map((imageUrl, index) => (
                  <button
                    key={`${post.id}-${index}`}
                    type="button"
                    onClick={navigateToPost}
                    className="block w-full flex-shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={post.title}
                      className="max-h-[480px] w-full object-contain sm:max-h-[680px]"
                    />
                  </button>
                ))}
              </div>

              {isMultiImageGallery && (
                <>
                  <button
                    type="button"
                    onClick={prevImg}
                    className="absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition-colors hover:bg-black/80 md:flex"
                    aria-label="Previous image"
                  >
                    {"\u2039"}
                  </button>
                  <button
                    type="button"
                    onClick={nextImg}
                    className="absolute right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition-colors hover:bg-black/80 md:flex"
                    aria-label="Next image"
                  >
                    {"\u203A"}
                  </button>
                  <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white sm:px-3 sm:text-sm">
                    {imgIndex + 1} / {images.length}
                  </div>
                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                    {images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImgIndex(index);
                        }}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${
                          index === imgIndex ? "bg-white" : "bg-white/35"
                        }`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={navigateToPost}
              className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-indigo-300"
            >
              <span>{"\u{1F4AC}"}</span>
              <span>
                {resolvedNumComments} comment{resolvedNumComments !== 1 ? "s" : ""}
              </span>
            </button>
            <a
              href={redditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 transition-colors hover:text-gray-300"
            >
              Open on Reddit {"\u2197"}
            </a>
          </div>
        </div>
      </article>
    </div>
  );
}
