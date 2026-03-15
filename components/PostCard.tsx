"use client";

import Link from "next/link";
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

function getImageUrl(post: RedditPost): string | null {
  if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(post.url)) return post.url;
  if (post.domain === "i.redd.it" || post.domain === "i.imgur.com") return post.url;
  if (post.thumbnail) return post.thumbnail;
  return null;
}

interface PostCardProps {
  post: RedditPost;
  onDismiss: (id: string) => void;
}

export default function PostCard({ post, onDismiss }: PostCardProps) {
  const slug = post.permalink.split("/").filter(Boolean).pop() ?? post.id;
  const detailUrl = `/r/${post.subreddit}/comments/${post.id}/${slug}`;
  const imageUrl = getImageUrl(post);
  const redditUrl = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/${slug}/`;

  function saveAndNavigate() {
    try {
      sessionStorage.setItem(`post:${post.id}`, JSON.stringify(post));
    } catch {
      // sessionStorage unavailable — detail page will fetch from API
    }
  }

  return (
    <article className="bg-gray-900 rounded-lg p-4 border border-gray-800 relative">
      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(post.id)}
        aria-label="Dismiss post"
        className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors text-lg leading-none z-10"
      >
        ✕
      </button>

      <div className="flex gap-3">
        {/* Thumbnail */}
        {imageUrl && (
          <Link href={detailUrl} className="flex-shrink-0 mt-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="w-16 h-16 object-cover rounded bg-gray-800"
            />
          </Link>
        )}

        <div className="flex-1 min-w-0 pr-6">
          {/* Subreddit label */}
          <div className="mb-1">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
              r/{post.subreddit}
            </span>
            {post.flair && (
              <span className="ml-2 text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                {post.flair}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-base font-semibold text-gray-100 leading-snug mb-2">
            <Link href={detailUrl} onClick={saveAndNavigate} className="hover:text-indigo-300 transition-colors">
              {post.title}
            </Link>
          </h2>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>by u/{post.author}</span>
            <span aria-label={`${post.score} points`}>▲ {formatScore(post.score)}</span>
            <span>{timeAgo(post.createdUtc)}</span>
            {!post.isSelf && (
              <span className="text-gray-600 italic">{post.domain}</span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-3">
            <Link
              href={detailUrl}
              onClick={saveAndNavigate}
              className="text-xs text-gray-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              <span>💬</span>
              <span>{post.numComments} comment{post.numComments !== 1 ? "s" : ""}</span>
            </Link>
            <a
              href={redditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Open on Reddit ↗
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
