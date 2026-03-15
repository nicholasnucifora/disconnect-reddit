"use client";

import { useState } from "react";
import { CommentOrMore, RedditComment, RedditMoreComments } from "@/lib/reddit";

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
        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
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

  return (
    <div className={comment.depth > 0 ? "border-l border-gray-700 ml-4 pl-3" : ""}>
      {/* Clickable header — collapses/expands the comment */}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-xs text-gray-500 cursor-pointer select-none hover:text-gray-300 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="font-mono text-gray-600">{collapsed ? "[+]" : "[-]"}</span>
        <span className="font-medium text-gray-300">u/{comment.author}</span>
        <span>▲ {formatScore(comment.score)}</span>
        <span>{timeAgo(comment.createdUtc)}</span>
        {collapsed && descendantCount > 0 && (
          <span className="text-gray-600">({descendantCount} {descendantCount === 1 ? "reply" : "replies"})</span>
        )}
      </div>

      {!collapsed && (
        <>
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
            {comment.body}
          </p>

          {replies.length > 0 && (
            <div className="mt-2 space-y-2">
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
