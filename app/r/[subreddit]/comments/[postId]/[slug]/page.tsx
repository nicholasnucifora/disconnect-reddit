"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Comment from "@/components/Comment";
import RedditMarkdown from "@/components/RedditMarkdown";
import { CommentOrMore, countLoadedComments, RedditPost } from "@/lib/reddit";
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
  const { isSaved, toggle } = useSavedPosts();
  const subreddit = params.subreddit as string;
  const postId = params.postId as string;
  const slug = params.slug as string;

  const [post, setPost] = useState<RedditPost | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(`post:${postId}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [comments, setComments] = useState<CommentOrMore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const loadedCommentCount = countLoadedComments(comments);
  const displayedCommentCount = post
    ? Math.max(post.numComments, loadedCommentCount)
    : loadedCommentCount;

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
        const nextComments = data.comments ?? [];
        const nextPost = data.post ?? post;
        const correctedCommentCount = Math.max(
          nextPost?.numComments ?? 0,
          countLoadedComments(nextComments)
        );

        if (nextPost) {
          const correctedPost =
            correctedCommentCount === nextPost.numComments
              ? nextPost
              : { ...nextPost, numComments: correctedCommentCount };

          setPost(correctedPost);
          try {
            localStorage.setItem(`post:${postId}`, JSON.stringify(correctedPost));
          } catch {
            // storage unavailable
          }
        }

        setComments(nextComments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [subreddit, postId, slug]);

  const saved = post ? isSaved(post.id) : false;

  function handleToggleSaved() {
    if (!post) return;
    toggle(post);
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
        >
          ← Back
        </button>

        {!post && loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}

        {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}

        {post && (
          <>
            <article className="mb-8 rounded-lg border border-gray-800 bg-gray-900 p-7">
              <div className="mb-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-sm font-semibold uppercase tracking-wide text-indigo-400">
                    r/{post.subreddit}
                  </span>
                  {post.flair && (
                    <span className="ml-2 rounded bg-gray-800 px-2 py-0.5 text-sm text-gray-500">
                      {post.flair}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleToggleSaved}
                  aria-label={saved ? "Remove from saved posts" : "Save post"}
                  title={saved ? "Saved" : "Save post"}
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border text-xl transition-colors ${
                    saved
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-amber-400/50 hover:text-amber-300"
                  }`}
                >
                  {saved ? "★" : "☆"}
                </button>
              </div>

              <h1 className="mb-4 text-3xl font-bold leading-snug text-gray-100">
                {post.title || slug.replace(/-/g, " ") || "Post"}
              </h1>

              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                <span>by u/{post.author}</span>
                <span>▲ {formatScore(post.score)}</span>
                <span>{timeAgo(post.createdUtc)}</span>
                {!post.isSelf && post.domain && <span className="italic">{post.domain}</span>}
              </div>

              {post.isGallery && post.galleryImages.length > 0 && (
                <div className="relative mb-4 select-none overflow-hidden rounded-lg bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.galleryImages[galleryIndex].url}
                    alt={`${post.title} (${galleryIndex + 1} of ${post.galleryImages.length})`}
                    className="max-h-[760px] w-full object-contain"
                  />
                  {post.galleryImages.length > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setGalleryIndex(
                            (index) =>
                              (index - 1 + post.galleryImages.length) % post.galleryImages.length
                          )
                        }
                        className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white transition-colors hover:bg-black/80"
                        aria-label="Previous image"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() =>
                          setGalleryIndex((index) => (index + 1) % post.galleryImages.length)
                        }
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white transition-colors hover:bg-black/80"
                        aria-label="Next image"
                      >
                        ›
                      </button>
                      <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        {galleryIndex + 1} / {post.galleryImages.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              {!post.isGallery && post.url && isImageUrl(post.url, post.domain) && (
                <a href={post.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.url}
                    alt={post.title}
                    className="mb-5 max-h-[760px] w-full rounded-lg bg-gray-800 object-contain"
                  />
                </a>
              )}

              {post.selftext && (
                <div className="mb-5 border-t border-gray-800 pt-5">
                  <RedditMarkdown
                    className="prose prose-invert max-w-none text-base leading-relaxed text-gray-300
                    prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-l-2 prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
                    prose-em:text-gray-300 prose-strong:text-gray-100
                    prose-table:text-gray-300 prose-td:text-gray-300 prose-th:text-gray-200"
                  >
                    {post.selftext}
                  </RedditMarkdown>
                </div>
              )}

              {post.isVideo && (
                <a
                  href={
                    post.permalink
                      ? `https://www.reddit.com${post.permalink}`
                      : `https://www.reddit.com/r/${subreddit}/comments/${postId}/${slug}/`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-5 flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-3 text-base text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  <span className="flex-shrink-0">▶</span>
                  <span>Watch video on Reddit</span>
                  <span className="flex-shrink-0 text-gray-500">↗</span>
                </a>
              )}

              {!post.isSelf &&
                !post.isGallery &&
                !post.isVideo &&
                post.url &&
                !isImageUrl(post.url, post.domain) && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-5 flex items-center gap-2 truncate rounded-lg bg-gray-800 px-4 py-3 text-base text-indigo-400 transition-colors hover:text-indigo-300"
                  >
                    <span className="flex-shrink-0">🔗</span>
                    <span className="truncate">{post.url}</span>
                    <span className="flex-shrink-0 text-gray-500">↗</span>
                  </a>
                )}

              <div className="mt-1 border-t border-gray-800 pt-4">
                <a
                  href={
                    post.permalink
                      ? `https://www.reddit.com${post.permalink}`
                      : `https://www.reddit.com/r/${subreddit}/comments/${postId}/${slug}/`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 transition-colors hover:text-gray-300"
                >
                  Open on Reddit ↗
                </a>
              </div>
            </article>

            <section>
              <h2 className="mb-5 text-base font-semibold uppercase tracking-wide text-gray-400">
                {displayedCommentCount} Comment{displayedCommentCount !== 1 ? "s" : ""}
              </h2>
              {loading ? (
                <div className="space-y-4">
                  {[80, 60, 90, 50, 70].map((width, index) => (
                    <div key={index} className="flex animate-pulse gap-3">
                      <div className="w-0.5 flex-shrink-0 self-stretch rounded-full bg-gray-800" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 w-24 rounded bg-gray-800" />
                        <div className="h-3 rounded bg-gray-800" style={{ width: `${width}%` }} />
                        <div className="h-3 w-3/4 rounded bg-gray-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-gray-500">No comments found.</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <Comment
                      key={comment.id}
                      comment={comment}
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
