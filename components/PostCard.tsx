"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RedditPost } from "@/lib/reddit";
import { useSavedPosts } from "@/lib/saved-posts";

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatScore(score: number): string {
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return String(score);
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
  const { isSaved, toggle } = useSavedPosts();
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
    if (clicked) return;
    setClicked(true);
    if (onDismiss) onDismiss(post.id);
    router.push(detailUrl);
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

  function prevImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => (index - 1 + images.length) % images.length);
  }

  function nextImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((index) => (index + 1) % images.length);
  }

  function handleToggleSaved(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle(post);
  }

  const saved = isSaved(post.id);

  return (
    <article
      className={`relative rounded-lg border border-gray-800 bg-gray-900 transition-opacity duration-150 ${
        clicked ? "opacity-50" : ""
      }`}
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-start justify-between gap-4">
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
                {saved ? "★" : "☆"}
              </button>
            </div>

            <h2 className="mb-2 text-xl font-semibold leading-snug text-gray-100">
              <a
                href={detailUrl}
                onClick={navigateToPost}
                className="cursor-pointer transition-colors hover:text-indigo-300"
              >
                {post.title}
              </a>
            </h2>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-gray-500">
              <span>by u/{post.author}</span>
              <span aria-label={`${post.score} points`}>▲ {formatScore(post.score)}</span>
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
                className="h-20 w-28 rounded bg-gray-800 object-cover"
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
          <div className="relative mt-4 select-none overflow-hidden rounded-lg bg-gray-800">
            <a href={detailUrl} onClick={navigateToPost} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[imgIndex]}
                alt={post.title}
                className="max-h-[680px] w-full object-contain"
              />
            </a>

            {images.length > 1 && (
              <>
                <button
                  onClick={prevImg}
                  className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition-colors hover:bg-black/80"
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  onClick={nextImg}
                  className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition-colors hover:bg-black/80"
                  aria-label="Next image"
                >
                  ›
                </button>
                <div className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
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
            <span>💬</span>
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
            Open on Reddit ↗
          </a>
        </div>
      </div>
    </article>
  );
}
