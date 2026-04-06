"use client";

import { useState } from "react";
import { CommentOrMore, RedditComment, RedditMoreComments } from "@/lib/reddit";
import { usernameColor } from "@/lib/utils";
import RedditMarkdown from "@/components/RedditMarkdown";

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

function countDescendants(comments: CommentOrMore[]): number {
  let n = 0;
  for (const c of comments) {
    if (!c.isMore) {
      n += 1 + countDescendants((c as RedditComment).replies);
    }
  }
  return n;
}

interface CommentProps {
  comment: CommentOrMore;
  subreddit: string;
  postId: string;
}

function MoreStub({
  stub,
  subreddit,
  postId,
  onLoaded,
}: {
  stub: RedditMoreComments;
  subreddit: string;
  postId: string;
  onLoaded: (comments: CommentOrMore[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentId = stub.children[0] ?? stub.id;

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ subreddit, postId, commentId });
      const res = await fetch(`/api/reddit/more?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      onLoaded(data.comments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ml-4 pl-3 border-l border-gray-700">
      {error && <p className="text-red-400 text-xs mb-1">{error}</p>}
      <button
        onClick={loadMore}
        disabled={loading}
        className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
      >
        {loading ? "Loading…" : `Load ${stub.count > 0 ? stub.count : ""} more replies`}
      </button>
    </div>
  );
}

function RegularComment({
  comment,
  subreddit,
  postId,
}: {
  comment: RedditComment;
  subreddit: string;
  postId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replies, setReplies] = useState<CommentOrMore[]>(comment.replies);

  function handleMoreLoaded(index: number, loaded: CommentOrMore[]) {
    setReplies((prev) => {
      const next = [...prev];
      next.splice(index, 1, ...loaded);
      return next;
    });
  }

  const descendantCount = countDescendants(replies);
  const nameColor = usernameColor(comment.author);

  return (
    <div className="flex gap-0">
      {/* Clickable thread line for nested comments */}
      {comment.depth > 0 && (
        <div
          className="flex-shrink-0 w-5 flex justify-center cursor-pointer group"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <div className="w-px bg-gray-700 group-hover:bg-indigo-500 transition-colors" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Header — click to collapse */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5 cursor-pointer select-none group"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="font-mono text-gray-600 text-xs group-hover:text-gray-400 transition-colors">
            {collapsed ? "[+]" : "[-]"}
          </span>
          <span className={`font-semibold text-sm ${nameColor}`}>
            u/{comment.author}
          </span>
          <span className="text-xs text-gray-500">▲ {formatScore(comment.score)}</span>
          <span className="text-xs text-gray-600">{timeAgo(comment.createdUtc)}</span>
          {collapsed && descendantCount > 0 && (
            <span className="text-xs text-gray-600">
              ({descendantCount} {descendantCount === 1 ? "reply" : "replies"})
            </span>
          )}
        </div>

        {!collapsed && (
          <>
            <RedditMarkdown className="text-base text-gray-200 leading-relaxed prose prose-invert prose-sm max-w-none
              prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-2 prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
              prose-strong:text-gray-100 prose-em:text-gray-300
              mb-2">
              {comment.body}
            </RedditMarkdown>

            {replies.length > 0 && (
              <div className="mt-3 space-y-3">
                {replies.map((reply, i) =>
                  reply.isMore ? (
                    <MoreStub
                      key={reply.id}
                      stub={reply}
                      subreddit={subreddit}
                      postId={postId}
                      onLoaded={(loaded) => handleMoreLoaded(i, loaded)}
                    />
                  ) : (
                    <RegularComment
                      key={reply.id}
                      comment={reply}
                      subreddit={subreddit}
                      postId={postId}
                    />
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Comment({ comment, subreddit, postId }: CommentProps) {
  const [replacedWith, setReplacedWith] = useState<CommentOrMore[] | null>(null);

  if (replacedWith) {
    return (
      <>
        {replacedWith.map((c) => (
          <Comment key={c.id} comment={c} subreddit={subreddit} postId={postId} />
        ))}
      </>
    );
  }

  if (comment.isMore) {
    return (
      <MoreStub
        stub={comment}
        subreddit={subreddit}
        postId={postId}
        onLoaded={(loaded) => setReplacedWith(loaded)}
      />
    );
  }

  return <RegularComment comment={comment} subreddit={subreddit} postId={postId} />;
}
