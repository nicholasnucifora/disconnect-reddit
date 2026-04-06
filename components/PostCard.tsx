"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RedditPost } from "@/lib/reddit";

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
  const slug = post.permalink.split("/").filter(Boolean).pop() ?? post.id;
  const detailUrl = `/r/${post.subreddit}/comments/${post.id}/${slug}`;
  const redditUrl = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/${slug}/`;

  useEffect(() => {
    router.prefetch(detailUrl);
    try {
      localStorage.setItem(`post:${post.id}`, JSON.stringify(post));
    } catch {
      // storage unavailable
    }
  }, [router, detailUrl, post]);

  function navigateToPost(e: React.MouseEvent) {
    e.preventDefault();
    if (clicked) return;
    setClicked(true);
    router.push(detailUrl);
    if (onDismiss) setTimeout(() => onDismiss(post.id), 800);
  }

  const hasGallery = post.isGallery && post.galleryImages.length > 0;
  const isImage = !post.isGallery && isDirectImage(post.url, post.domain);
  const showLargeMedia = hasGallery || isImage;
  const images = hasGallery
    ? post.galleryImages.map((g) => g.url)
    : isImage
    ? [post.url]
    : [];
  const hasThumbnail = !showLargeMedia && !!post.thumbnail;

  function prevImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((i) => (i - 1 + images.length) % images.length);
  }
  function nextImg(e: React.MouseEvent) {
    e.stopPropagation();
    setImgIndex((i) => (i + 1) % images.length);
  }

  return (
    <article
      className={`bg-gray-900 rounded-lg border border-gray-800 relative transition-opacity duration-150 ${
        clicked ? "opacity-50" : ""
      }`}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={() => onDismiss(post.id)}
          aria-label="Dismiss post"
          className="absolute top-5 right-5 text-gray-500 hover:text-gray-200 transition-colors text-xl leading-none z-10"
        >
          ✕
        </button>
      )}

      <div className="p-6">
        {/* Header: text content + optional small link thumbnail */}
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 pr-8">
            {/* Subreddit + flair */}
            <div className="mb-1.5">
              <span className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">
                r/{post.subreddit}
              </span>
              {post.flair && (
                <span className="ml-2 text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                  {post.flair}
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl font-semibold text-gray-100 leading-snug mb-2">
              <a
                href={detailUrl}
                onClick={navigateToPost}
                className="hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {post.title}
              </a>
            </h2>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-gray-500">
              <span>by u/{post.author}</span>
              <span aria-label={`${post.score} points`}>▲ {formatScore(post.score)}</span>
              <span>{timeAgo(post.createdUtc)}</span>
              {!post.isSelf && (
                <span className="text-gray-600 italic">{post.domain}</span>
              )}
            </div>
          </div>

          {/* Small thumbnail — link posts only */}
          {hasThumbnail && (
            <a href={detailUrl} onClick={navigateToPost} className="flex-shrink-0 mt-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.thumbnail!}
                alt=""
                className="w-28 h-20 object-cover rounded bg-gray-800"
              />
            </a>
          )}
        </div>

        {/* Selftext preview — text posts only */}
        {post.isSelf && post.selftext && (
          <p className="mt-3 text-base text-gray-400 leading-relaxed line-clamp-5">
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

        {/* Full-width image / gallery carousel */}
        {showLargeMedia && images.length > 0 && (
          <div className="mt-4 relative rounded-lg overflow-hidden bg-gray-800 select-none">
            <a href={detailUrl} onClick={navigateToPost} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[imgIndex]}
                alt={post.title}
                className="w-full max-h-[680px] object-contain"
              />
            </a>

            {images.length > 1 && (
              <>
                <button
                  onClick={prevImg}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/80 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl transition-colors z-10"
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  onClick={nextImg}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/80 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl transition-colors z-10"
                  aria-label="Next image"
                >
                  ›
                </button>
                <div className="absolute top-3 right-3 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                  {imgIndex + 1} / {images.length}
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        setImgIndex(i);
                      }}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        i === imgIndex ? "bg-white" : "bg-white/35"
                      }`}
                      aria-label={`Go to image ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-4">
          <a
            href={detailUrl}
            onClick={navigateToPost}
            className="text-sm text-gray-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>💬</span>
            <span>
              {post.numComments} comment{post.numComments !== 1 ? "s" : ""}
            </span>
          </a>
          <a
            href={redditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Open on Reddit ↗
          </a>
        </div>
      </div>
    </article>
  );
}
