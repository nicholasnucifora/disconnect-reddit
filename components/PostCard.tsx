"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RedditPost } from "@/lib/reddit";
import { useSavedPosts } from "@/lib/saved-posts";

const CARD_SWIPE_TRIGGER = 72;
const CARD_SWIPE_PREVIEW = 120;
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
}

export default function PostCard({ post, onDismiss }: PostCardProps) {
  const router = useRouter();
  const [clicked, setClicked] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [resolvedNumComments, setResolvedNumComments] = useState(post.numComments);
  const [galleryTouchStartX, setGalleryTouchStartX] = useState<number | null>(null);
  const [galleryTouchDeltaX, setGalleryTouchDeltaX] = useState(0);
  const [cardTouchStartX, setCardTouchStartX] = useState<number | null>(null);
  const [cardTouchStartY, setCardTouchStartY] = useState<number | null>(null);
  const [cardSwipeOffset, setCardSwipeOffset] = useState(0);
  const [cardSwipeActive, setCardSwipeActive] = useState(false);
  const suppressClickUntilRef = useRef(0);
  const { isSaved, toggle, unsave } = useSavedPosts();
  const slug = post.permalink.split("/").filter(Boolean).pop() ?? post.id;
  const detailUrl = `/r/${post.subreddit}/comments/${post.id}/${slug}`;
  const redditUrl = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/${slug}/`;

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

  function navigateToPost(e: React.MouseEvent) {
    e.preventDefault();
    if (
      clicked ||
      cardSwipeActive ||
      Math.abs(cardSwipeOffset) > 8 ||
      Date.now() < suppressClickUntilRef.current
    ) {
      return;
    }
    setClicked(true);
    router.push(detailUrl);
  }

  function handleDismiss() {
    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    if (onDismiss) {
      void onDismiss(post.id);
      return;
    }

    if (isSaved(post.id)) {
      unsave(post.id);
    }
  }

  function handleSaveToggle() {
    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    toggle(post);
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
  const galleryTranslate = `calc(${-imgIndex * 100}% + ${galleryTouchDeltaX}px)`;

  function prevImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => (index - 1 + images.length) % images.length);
  }

  function nextImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => (index + 1) % images.length);
  }

  function handleGalleryTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (!isMultiImageGallery) return;
    setGalleryTouchStartX(event.touches[0]?.clientX ?? null);
    setGalleryTouchDeltaX(0);
  }

  function handleGalleryTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (galleryTouchStartX === null || !isMultiImageGallery) return;
    const currentX = event.touches[0]?.clientX ?? galleryTouchStartX;
    setGalleryTouchDeltaX(currentX - galleryTouchStartX);
  }

  function handleGalleryTouchEnd() {
    if (galleryTouchStartX === null || !isMultiImageGallery) return;
    if (galleryTouchDeltaX <= -40) {
      setImgIndex((index) => (index + 1) % images.length);
    } else if (galleryTouchDeltaX >= 40) {
      setImgIndex((index) => (index - 1 + images.length) % images.length);
    }
    setGalleryTouchStartX(null);
    setGalleryTouchDeltaX(0);
  }

  function handleCardTouchStart(event: React.TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) return;
    if (isMultiImageGallery && target?.closest("[data-gallery-swipe='true']")) return;
    const touch = event.touches[0];
    if (!touch) return;
    setCardTouchStartX(touch.clientX);
    setCardTouchStartY(touch.clientY);
    setCardSwipeOffset(0);
    setCardSwipeActive(false);
  }

  function handleCardTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (cardTouchStartX === null || cardTouchStartY === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - cardTouchStartX;
    const deltaY = touch.clientY - cardTouchStartY;

    if (!cardSwipeActive && Math.abs(deltaY) > Math.abs(deltaX)) {
      setCardTouchStartX(null);
      setCardTouchStartY(null);
      setCardSwipeOffset(0);
      return;
    }

    if (!cardSwipeActive && Math.abs(deltaX) > 6) {
      setCardSwipeActive(true);
    }

    if (cardSwipeActive || Math.abs(deltaX) > 6) {
      event.preventDefault();
      setCardSwipeOffset(Math.max(-CARD_SWIPE_PREVIEW, Math.min(CARD_SWIPE_PREVIEW, deltaX)));
    }
  }

  function handleCardTouchEnd() {
    const finalOffset = cardSwipeOffset;
    const wasSwipe = cardSwipeActive;
    setCardTouchStartX(null);
    setCardTouchStartY(null);
    setCardSwipeOffset(0);
    setCardSwipeActive(false);

    if (!wasSwipe) return;

    suppressClickUntilRef.current = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;

    if (finalOffset <= -CARD_SWIPE_TRIGGER) {
      handleDismiss();
      return;
    }

    if (finalOffset >= CARD_SWIPE_TRIGGER) {
      handleSaveToggle();
    }
  }

  function handleCardTouchCancel() {
    setCardTouchStartX(null);
    setCardTouchStartY(null);
    setCardSwipeOffset(0);
    setCardSwipeActive(false);
  }

  function handleToggleSaved(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleSaveToggle();
  }

  function handleDismissClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleDismiss();
  }

  const saved = isSaved(post.id);
  const canDismiss = Boolean(onDismiss) || saved;
  const showSaveAction = cardSwipeOffset > 0;
  const showDismissAction = cardSwipeOffset < 0 && canDismiss;

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className={`absolute inset-0 flex items-center justify-between rounded-lg border ${
          showSaveAction
            ? "border-amber-500/40 bg-amber-500/15"
            : showDismissAction
            ? "border-red-500/40 bg-red-500/15"
            : "border-gray-800 bg-gray-900"
        }`}
      >
        <div className="flex h-full min-w-[5.5rem] items-center justify-center px-4 text-3xl text-amber-300">
          {"\u2605"}
        </div>
        <div className="flex h-full min-w-[5.5rem] items-center justify-center px-4 text-3xl text-red-300">
          {"\u2715"}
        </div>
      </div>

      <article
        className={`relative rounded-lg border border-gray-800 bg-gray-900 transition-[transform,opacity] duration-150 ${
          clicked ? "opacity-50" : ""
        } ${cardTouchStartX === null ? "ease-out" : ""}`}
        style={{ transform: `translateX(${cardSwipeOffset}px)`, touchAction: "pan-y" }}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleSaved}
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
                  <button
                    onClick={handleDismissClick}
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
              </div>

              <h2 className="mb-2 text-lg font-semibold leading-snug text-gray-100 sm:text-xl">
                <a
                  href={detailUrl}
                  onClick={navigateToPost}
                  className="cursor-pointer transition-colors hover:text-indigo-300"
                >
                  {post.title}
                </a>
              </h2>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 sm:text-base">
                <span>by u/{post.author}</span>
                <span>{timeAgo(post.createdUtc)}</span>
                {!post.isSelf && <span className="italic text-gray-600">{post.domain}</span>}
              </div>
            </div>

            {hasThumbnail && (
              <a href={detailUrl} onClick={navigateToPost} className="mt-0.5 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.thumbnail!}
                  alt=""
                  className="h-16 w-20 rounded bg-gray-800 object-cover sm:h-20 sm:w-28"
                />
              </a>
            )}
          </div>

          {post.isSelf && post.selftext && (
            <p className="mt-3 line-clamp-5 text-base leading-relaxed text-gray-400">
              {post.selftext
                .replace(/!\[.*?\]\(.*?\)/g, "")
                .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
                .replace(/#{1,6}\s+/g, "")
                .replace(/[*_~`]/g, "")
                .replace(/^\s*[-*+]\s+/gm, "")
                .replace(/^\s*\d+\.\s+/gm, "")
                .replace(/^>\s*/gm, "")
                .replace(/\n{2,}/g, "\n")
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
                  <a
                    key={`${post.id}-${index}`}
                    href={detailUrl}
                    onClick={navigateToPost}
                    className="block w-full flex-shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={post.title}
                      className="max-h-[480px] w-full object-contain sm:max-h-[680px]"
                    />
                  </a>
                ))}
              </div>

              {isMultiImageGallery && (
                <>
                  <button
                    onClick={prevImg}
                    className="absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition-colors hover:bg-black/80 md:flex"
                    aria-label="Previous image"
                  >
                    {"\u2039"}
                  </button>
                  <button
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
            <a
              href={detailUrl}
              onClick={navigateToPost}
              className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-indigo-300"
            >
              <span>{"\u{1F4AC}"}</span>
              <span>
                {resolvedNumComments} comment{resolvedNumComments !== 1 ? "s" : ""}
              </span>
            </a>
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
