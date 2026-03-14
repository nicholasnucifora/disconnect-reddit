"use client";

import { RedditPost } from "@/lib/reddit";
import CommentThread from "./CommentThread";

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

interface PostCardProps {
  post: RedditPost;
  onDismiss: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

export default function PostCard({
  post,
  onDismiss,
  isExpanded,
  onToggleExpand,
}: PostCardProps) {
  const slug = post.permalink.split("/").filter(Boolean).pop() ?? post.id;

  return (
    <article className="bg-gray-900 rounded-lg p-4 border border-gray-800 relative">
      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(post.id)}
        aria-label="Dismiss post"
        className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors text-lg leading-none"
      >
        ✕
      </button>

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
      <h2 className="text-base font-semibold text-gray-100 leading-snug pr-6 mb-2">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-indigo-300 transition-colors"
        >
          {post.title}
        </a>
      </h2>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>
          by{" "}
          <a
            href={`https://www.reddit.com/user/${post.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            u/{post.author}
          </a>
        </span>
        <span aria-label={`${post.score} points`}>
          ▲ {formatScore(post.score)}
        </span>
        <span>{timeAgo(post.createdUtc)}</span>
        {!post.isSelf && (
          <span className="text-gray-600 italic">{post.domain}</span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onToggleExpand(post.id)}
          className="text-xs text-gray-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
        >
          <span>💬</span>
          <span>
            {post.numComments} comment{post.numComments !== 1 ? "s" : ""}
            {isExpanded ? " ▲" : " ▼"}
          </span>
        </button>
        <a
          href={`https://www.reddit.com${post.permalink}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Open on Reddit ↗
        </a>
      </div>

      {/* Comment thread (expanded) */}
      {isExpanded && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <CommentThread
            subreddit={post.subreddit}
            postId={post.id}
            slug={slug}
          />
        </div>
      )}
    </article>
  );
}
