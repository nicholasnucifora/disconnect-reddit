"use client";

import { useRef, useState } from "react";
import { CommentOrMore, RedditComment, RedditMoreComments } from "@/lib/reddit";
import { usernameColor } from "@/lib/utils";
import RedditMarkdown from "@/components/RedditMarkdown";

const MOBILE_COMMENT_MEDIA_QUERY = "(max-width: 767px)";
const COMMENT_TAP_MAX_DURATION_MS = 250;
const COMMENT_TAP_MAX_MOVEMENT_PX = 10;
const COMMENT_BODY_INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, summary, label, [data-comment-no-collapse='true']";

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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

interface CommentBodyTapState {
  pointerId: number;
  startedAt: number;
  startX: number;
  startY: number;
}

function isMobileTouchPointer(event: React.PointerEvent<HTMLDivElement>): boolean {
  if (event.pointerType !== "touch" || typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MOBILE_COMMENT_MEDIA_QUERY).matches;
}

function shouldSkipBodyCollapse(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(COMMENT_BODY_INTERACTIVE_SELECTOR) !== null;
}

function hasActiveTextSelection(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (window.getSelection()?.toString().trim().length ?? 0) > 0;
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
    <div className="ml-5 pl-4 border-l border-gray-700">
      {error && <p className="text-red-400 text-sm mb-1">{error}</p>}
      <button
        onClick={loadMore}
        disabled={loading}
        className="text-base text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
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
  const commentBodyTapStateRef = useRef<CommentBodyTapState | null>(null);

  function handleMoreLoaded(index: number, loaded: CommentOrMore[]) {
    setReplies((prev) => {
      const next = [...prev];
      next.splice(index, 1, ...loaded);
      return next;
    });
  }

  const descendantCount = countDescendants(replies);
  const nameColor = usernameColor(comment.author);

  function handleCommentBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isMobileTouchPointer(event) || shouldSkipBodyCollapse(event.target)) {
      commentBodyTapStateRef.current = null;
      return;
    }

    commentBodyTapStateRef.current = {
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handleCommentBodyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const tapState = commentBodyTapStateRef.current;

    if (!tapState || tapState.pointerId !== event.pointerId) {
      return;
    }

    const movedX = Math.abs(event.clientX - tapState.startX);
    const movedY = Math.abs(event.clientY - tapState.startY);

    if (movedX > COMMENT_TAP_MAX_MOVEMENT_PX || movedY > COMMENT_TAP_MAX_MOVEMENT_PX) {
      commentBodyTapStateRef.current = null;
    }
  }

  function handleCommentBodyPointerCancel() {
    commentBodyTapStateRef.current = null;
  }

  function handleCommentBodyPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const tapState = commentBodyTapStateRef.current;
    commentBodyTapStateRef.current = null;

    if (!tapState || tapState.pointerId !== event.pointerId) {
      return;
    }

    if (shouldSkipBodyCollapse(event.target) || hasActiveTextSelection()) {
      return;
    }

    if (Date.now() - tapState.startedAt > COMMENT_TAP_MAX_DURATION_MS) {
      return;
    }

    setCollapsed((current) => !current);
  }

  return (
    <div className="flex gap-0">
      {/* Clickable thread line for nested comments */}
      {comment.depth > 0 && (
        <div
          className="flex-shrink-0 w-6 flex justify-center cursor-pointer group"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <div className="w-px bg-gray-700 group-hover:bg-indigo-500 transition-colors" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Header — click to collapse */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2 cursor-pointer select-none group"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="font-mono text-gray-600 text-sm group-hover:text-gray-400 transition-colors">
            {collapsed ? "[+]" : "[-]"}
          </span>
          <span className={`font-semibold text-base ${nameColor}`}>
            u/{comment.author}
          </span>
          <span className="text-sm text-gray-600">{timeAgo(comment.createdUtc)}</span>
          {collapsed && descendantCount > 0 && (
            <span className="text-sm text-gray-600">
              ({descendantCount} {descendantCount === 1 ? "reply" : "replies"})
            </span>
          )}
        </div>

        {!collapsed && (
          <>
            <div
              className="select-text"
              onPointerDown={handleCommentBodyPointerDown}
              onPointerMove={handleCommentBodyPointerMove}
              onPointerCancel={handleCommentBodyPointerCancel}
              onPointerUp={handleCommentBodyPointerUp}
            >
              <RedditMarkdown className="text-base text-gray-200 leading-relaxed prose prose-invert max-w-none
                prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                prose-blockquote:border-l-2 prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
                prose-strong:text-gray-100 prose-em:text-gray-300
                mb-3">
                {comment.body}
              </RedditMarkdown>
            </div>

            {replies.length > 0 && (
              <div className="mt-3 space-y-4">
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
