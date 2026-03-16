"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RedditPost, CommentOrMore } from "@/lib/reddit";
import Comment from "@/components/Comment";

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

function isImageUrl(url: string, domain: string): boolean {
  return (
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
    domain === "i.redd.it" ||
    domain === "i.imgur.com"
  );
}

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const subreddit = params.subreddit as string;
  const postId = params.postId as string;
  const slug = params.slug as string;

  // Seed post from sessionStorage immediately so metadata shows before API responds
  const [post, setPost] = useState<RedditPost | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = sessionStorage.getItem(`post:${postId}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [comments, setComments] = useState<CommentOrMore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/reddit/comments?${new URLSearchParams({ subreddit, postId, slug })}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setPost(data.post);
        setComments(data.comments ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subreddit, postId, slug]);

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>

        {!post && loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm py-8 text-center">{error}</p>
        )}

        {post && (
          <>
            {/* Post */}
            <article className="bg-gray-900 rounded-lg border border-gray-800 p-5 mb-6">
              {/* Subreddit + flair */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
                  r/{post.subreddit}
                </span>
                {post.flair && (
                  <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                    {post.flair}
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-xl font-bold text-gray-100 leading-snug mb-3">
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-4">
                <span>by u/{post.author}</span>
                <span>▲ {formatScore(post.score)}</span>
                <span>{timeAgo(post.createdUtc)}</span>
                {!post.isSelf && post.domain && (
                  <span className="italic">{post.domain}</span>
                )}
              </div>

              {/* Image */}
              {post.url && isImageUrl(post.url, post.domain) && (
                <a href={post.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.url}
                    alt={post.title}
                    className="w-full rounded-lg object-contain max-h-[600px] bg-gray-800 mb-4"
                  />
                </a>
              )}

              {/* Self text */}
              {post.selftext && (
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-4 border-t border-gray-800 pt-4">
                  {post.selftext}
                </p>
              )}

              {/* External link (non-image, non-self) */}
              {!post.isSelf && post.url && !isImageUrl(post.url, post.domain) && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 bg-gray-800 rounded-lg px-3 py-2.5 mb-4 truncate transition-colors"
                >
                  <span className="flex-shrink-0">🔗</span>
                  <span className="truncate">{post.url}</span>
                  <span className="flex-shrink-0 text-gray-500">↗</span>
                </a>
              )}

              {/* Open on Reddit */}
              <div className="border-t border-gray-800 pt-3 mt-1">
                <a
                  href={
                    post.permalink
                      ? `https://www.reddit.com${post.permalink}`
                      : `https://www.reddit.com/r/${subreddit}/comments/${postId}/${slug}/`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Open on Reddit ↗
                </a>
              </div>
            </article>

            {/* Comments */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                {post.numComments} Comment{post.numComments !== 1 ? "s" : ""}
              </h2>
              {loading ? (
                <div className="space-y-4">
                  {[80, 60, 90, 50, 70].map((w, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-0.5 bg-gray-800 rounded-full flex-shrink-0 self-stretch" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 bg-gray-800 rounded w-24" />
                        <div className={`h-3 bg-gray-800 rounded`} style={{ width: `${w}%` }} />
                        <div className="h-3 bg-gray-800 rounded w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="text-gray-500 text-sm">No comments found.</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((c) => (
                    <Comment
                      key={c.id}
                      comment={c}
                      subreddit={subreddit}
                      postId={postId}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
