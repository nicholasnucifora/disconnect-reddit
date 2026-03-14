"use client";

import { useEffect, useState } from "react";
import { CommentOrMore } from "@/lib/reddit";
import Comment from "./Comment";

interface CommentThreadProps {
  subreddit: string;
  postId: string;
  slug: string;
}

export default function CommentThread({
  subreddit,
  postId,
  slug,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentOrMore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ subreddit, postId, slug });
        const res = await fetch(`/api/reddit/comments?${params.toString()}`);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!cancelled) {
          setComments(data.comments ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load comments");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [subreddit, postId, slug]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
        <svg
          className="animate-spin h-4 w-4 text-indigo-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        Loading comments…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-red-400 text-sm py-2">
        Could not load comments: {error}
      </p>
    );
  }

  if (comments.length === 0) {
    return <p className="text-gray-500 text-sm py-2">No comments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <Comment
          key={c.id}
          comment={c}
          subreddit={subreddit}
          postId={postId}
        />
      ))}
    </div>
  );
}
