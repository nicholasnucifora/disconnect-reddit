"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSubreddits } from "@/lib/subreddits-context";
import { useFeeds } from "@/lib/feeds-context";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const router = useRouter();
  const { subreddits, addSubreddit, removeSubreddit } = useSubreddits();
  const {
    feeds,
    activeFeedId,
    ready: feedsReady,
    getSubredditsForFeed,
    setActiveFeed,
    createFeed,
    deleteFeed,
    assignSubreddit,
    removeSubredditFromFeeds,
  } = useFeeds();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collapsedFeeds, setCollapsedFeeds] = useState<Set<string>>(new Set());
  const [creatingFeed, setCreatingFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [dragging, setDragging] = useState<{ sub: string; fromFeedId: string } | null>(null);
  const [dragOverFeedId, setDragOverFeedId] = useState<string | null>(null);
  const [sidebarDragStartX, setSidebarDragStartX] = useState<number | null>(null);
  const [sidebarDragOffset, setSidebarDragOffset] = useState(0);

  const pathname = usePathname();
  const isHomeRoute = pathname === "/";
  const activeSubreddit = pathname.match(/^\/r\/([^/]+)/)?.[1]?.toLowerCase();
  const isSavedPostsActive = pathname === "/saved-posts";
  const activeFeed = feeds.find((feed) => feed.id === activeFeedId) ?? feeds[0];

  function handleAdd() {
    if (!feedsReady) return;
    const name = input.trim().replace(/^r\//, "");
    if (!name) {
      setError("Enter a subreddit name");
      return;
    }
    if (subreddits.map((subreddit) => subreddit.toLowerCase()).includes(name.toLowerCase())) {
      setError(`r/${name} already added`);
      return;
    }
    setError(null);
    void addSubreddit(name);
    void assignSubreddit(name, activeFeedId);
    setInput("");
  }

  function handleRemove(subreddit: string) {
    void removeSubreddit(subreddit);
    void removeSubredditFromFeeds(subreddit);
  }

  function toggleCollapse(feedId: string) {
    setCollapsedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) next.delete(feedId);
      else next.add(feedId);
      return next;
    });
  }

  async function handleCreateFeed() {
    const name = newFeedName.trim();
    if (!name) return;
    const feed = await createFeed(name);
    if (!feed) return;
    setActiveFeed(feed.id);
    setCreatingFeed(false);
    setNewFeedName("");
  }

  function handleDrop(targetFeedId: string) {
    if (dragging && dragging.fromFeedId !== targetFeedId) {
      void assignSubreddit(dragging.sub, targetFeedId);
    }
    setDragging(null);
    setDragOverFeedId(null);
  }

  function handleFeedClick(feedId: string) {
    setActiveFeed(feedId);
    router.push("/");
  }

  function handleSidebarTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (!open) return;
    setSidebarDragStartX(event.touches[0]?.clientX ?? null);
    setSidebarDragOffset(0);
  }

  function handleSidebarTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (!open || sidebarDragStartX === null) return;
    const currentX = event.touches[0]?.clientX ?? sidebarDragStartX;
    const nextOffset = Math.min(0, currentX - sidebarDragStartX);
    setSidebarDragOffset(nextOffset);
  }

  function handleSidebarTouchEnd() {
    if (!open) return;
    const shouldClose = sidebarDragOffset <= -80;
    setSidebarDragStartX(null);
    setSidebarDragOffset(0);
    if (shouldClose) onClose?.();
  }

  return (
    <aside
      className={`fixed left-0 top-14 z-40 flex h-[calc(100vh-56px)] w-72 flex-col overflow-y-auto border-r border-gray-800 bg-gray-950 transition-transform duration-200 md:top-16 md:h-[calc(100vh-64px)] md:w-60 ${
        open ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0`}
      style={open && sidebarDragOffset !== 0 ? { transform: `translateX(${sidebarDragOffset}px)` } : undefined}
      onTouchStart={handleSidebarTouchStart}
      onTouchMove={handleSidebarTouchMove}
      onTouchEnd={handleSidebarTouchEnd}
      onTouchCancel={handleSidebarTouchEnd}
    >
      <nav className="flex-1 space-y-1 p-4">
        <Link
          href="/saved-posts"
          className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            isSavedPostsActive
              ? "bg-amber-950/50 text-amber-200"
              : "text-gray-300 hover:bg-gray-900 hover:text-white"
          }`}
        >
          <span className="text-base leading-none">★</span>
          <span>Saved Posts</span>
        </Link>

        <p className="px-2 pb-1 text-sm uppercase tracking-widest text-gray-600">Feeds</p>

        {feeds.map((feed) => {
          const feedSubreddits = getSubredditsForFeed(subreddits, feed.id);
          const isActive = isHomeRoute && feed.id === activeFeedId;
          const isCollapsed = collapsedFeeds.has(feed.id);
          const isDragOver = dragOverFeedId === feed.id && dragging?.fromFeedId !== feed.id;

          return (
            <div key={feed.id}>
              <div
                className={`group/feed flex items-center gap-0.5 rounded transition-colors ${
                  isActive ? "bg-teal-950/50" : ""
                }`}
              >
                <button
                  onClick={() => toggleCollapse(feed.id)}
                  className="w-7 flex-shrink-0 p-1.5 text-sm text-gray-600 transition-colors hover:text-gray-400"
                >
                  {isCollapsed ? ">" : "v"}
                </button>
                <button
                  onClick={() => handleFeedClick(feed.id)}
                  className={`flex-1 truncate px-1 py-1.5 text-left text-base transition-colors ${
                    isActive ? "font-medium text-teal-300" : "text-gray-300 hover:text-gray-100"
                  }`}
                >
                  {feed.name}
                </button>
                {feed.id !== "home" && (
                  <button
                    onClick={() => void deleteFeed(feed.id)}
                    className="p-1.5 text-sm text-gray-600 opacity-0 transition-all hover:text-red-400 group-hover/feed:opacity-100"
                    title="Delete feed"
                  >
                    x
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverFeedId(feed.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDragOverFeedId(null);
                    }
                  }}
                  onDrop={() => handleDrop(feed.id)}
                  className={`rounded pl-6 transition-colors ${
                    isDragOver ? "bg-teal-950/40 ring-1 ring-teal-700/50" : ""
                  }`}
                >
                  {feedSubreddits.map((subreddit) => {
                    const isSubredditActive = activeSubreddit === subreddit.toLowerCase();
                    const isDraggingThis = dragging?.sub === subreddit;

                    return (
                      <div
                        key={subreddit}
                        draggable
                        onDragStart={() => setDragging({ sub: subreddit, fromFeedId: feed.id })}
                        onDragEnd={() => {
                          setDragging(null);
                          setDragOverFeedId(null);
                        }}
                        className={`group/sub flex cursor-grab items-center gap-0.5 active:cursor-grabbing ${
                          isDraggingThis ? "opacity-40" : ""
                        }`}
                      >
                        <span className="select-none px-0.5 text-sm text-gray-700">#</span>
                        <Link
                          href={`/r/${subreddit}`}
                          className={`flex-1 truncate rounded px-2 py-1.5 text-base transition-colors ${
                            isSubredditActive
                              ? "bg-teal-900/40 text-teal-300"
                              : "text-gray-300 hover:bg-gray-900 hover:text-gray-100"
                          }`}
                        >
                          r/{subreddit}
                        </Link>
                        <button
                          onClick={() => handleRemove(subreddit)}
                          className="p-1.5 text-sm text-gray-600 opacity-0 transition-all hover:text-red-400 group-hover/sub:opacity-100"
                          aria-label={`Remove r/${subreddit}`}
                        >
                          x
                        </button>
                      </div>
                    );
                  })}

                  {feedSubreddits.length === 0 && (
                    <p className="px-2 py-1.5 text-sm italic text-gray-700">
                      {isDragOver ? "Drop here" : "Empty"}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {creatingFeed ? (
          <div className="flex gap-1.5 pt-2">
            <input
              autoFocus
              type="text"
              value={newFeedName}
              onChange={(event) => setNewFeedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateFeed();
                if (event.key === "Escape") {
                  setCreatingFeed(false);
                  setNewFeedName("");
                }
              }}
              onBlur={() => {
                if (!newFeedName.trim()) setCreatingFeed(false);
              }}
              placeholder="Feed name"
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-teal-600 focus:outline-none"
            />
            <button
              onClick={handleCreateFeed}
              className="rounded bg-teal-700 px-2.5 py-1.5 text-sm text-white transition-colors hover:bg-teal-600"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingFeed(true)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
          >
            <span>+</span>
            <span>New Feed</span>
          </button>
        )}
      </nav>

      <div className="space-y-2 border-t border-gray-800 p-4">
        <p className="text-sm text-gray-600">
          Adding to: <span className="text-gray-400">{activeFeed?.name}</span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && handleAdd()}
            placeholder="r/subreddit"
            className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-teal-600 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            className="flex-shrink-0 rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-600"
          >
            Add
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </aside>
  );
}
