"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSubreddits } from "@/lib/subreddits-context";
import { useFeeds } from "@/lib/feeds-context";

interface SidebarProps {
  open?: boolean;
}

export default function Sidebar({ open = false }: SidebarProps) {
  const { subreddits, addSubreddit, removeSubreddit } = useSubreddits();
  const {
    feeds, activeFeedId, getSubredditsForFeed,
    setActiveFeed, createFeed, deleteFeed, assignSubreddit, removeSubredditFromFeeds,
  } = useFeeds();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collapsedFeeds, setCollapsedFeeds] = useState<Set<string>>(new Set());
  const [creatingFeed, setCreatingFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [dragging, setDragging] = useState<{ sub: string; fromFeedId: string } | null>(null);
  const [dragOverFeedId, setDragOverFeedId] = useState<string | null>(null);

  const pathname = usePathname();

  function handleAdd() {
    const name = input.trim().replace(/^r\//, "");
    if (!name) { setError("Enter a subreddit name"); return; }
    if (subreddits.map((s) => s.toLowerCase()).includes(name.toLowerCase())) {
      setError(`r/${name} already added`); return;
    }
    setError(null);
    addSubreddit(name);
    assignSubreddit(name, activeFeedId);
    setInput("");
  }

  function handleRemove(sub: string) {
    removeSubreddit(sub);
    removeSubredditFromFeeds(sub);
  }

  function toggleCollapse(feedId: string) {
    setCollapsedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) next.delete(feedId); else next.add(feedId);
      return next;
    });
  }

  function handleCreateFeed() {
    const name = newFeedName.trim();
    if (!name) return;
    const feed = createFeed(name);
    setActiveFeed(feed.id);
    setCreatingFeed(false);
    setNewFeedName("");
  }

  function handleDrop(targetFeedId: string) {
    if (dragging && dragging.fromFeedId !== targetFeedId) {
      assignSubreddit(dragging.sub, targetFeedId);
    }
    setDragging(null);
    setDragOverFeedId(null);
  }

  const isHome = pathname === "/";
  const activeSubreddit = pathname.match(/^\/r\/([^/]+)/)?.[1]?.toLowerCase();
  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? feeds[0];

  return (
    <aside
      className={`fixed top-16 left-0 w-64 md:w-52 h-[calc(100vh-64px)] overflow-y-auto bg-gray-950 border-r border-gray-800 flex flex-col z-40 transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0`}
    >
      <nav className="flex-1 p-3 space-y-0.5">
        {/* Home link — shows active feed name */}
        <Link
          href="/"
          className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
            isHome
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-gray-100 hover:bg-gray-900"
          }`}
        >
          <span>⌂</span>
          <span className="truncate">{activeFeed?.name ?? "Home Feed"}</span>
        </Link>

        {/* Feeds list */}
        <div className="pt-3 space-y-1">
          <p className="text-xs text-gray-600 uppercase tracking-widest px-2 pb-1">Feeds</p>

          {feeds.map((feed) => {
            const feedSubs = getSubredditsForFeed(subreddits, feed.id);
            const isActive = feed.id === activeFeedId;
            const isCollapsed = collapsedFeeds.has(feed.id);
            const isDragOver = dragOverFeedId === feed.id && dragging?.fromFeedId !== feed.id;

            return (
              <div key={feed.id}>
                {/* Feed header */}
                <div
                  className={`flex items-center gap-0.5 group/feed rounded transition-colors ${
                    isActive ? "bg-teal-950/50" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleCollapse(feed.id)}
                    className="p-1 text-gray-600 hover:text-gray-400 transition-colors text-xs w-5 flex-shrink-0"
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                  <button
                    onClick={() => setActiveFeed(feed.id)}
                    className={`flex-1 text-left px-1 py-1 text-sm truncate transition-colors ${
                      isActive ? "text-teal-300 font-medium" : "text-gray-300 hover:text-gray-100"
                    }`}
                  >
                    {feed.name}
                  </button>
                  {feed.id !== "home" && (
                    <button
                      onClick={() => deleteFeed(feed.id)}
                      className="opacity-0 group-hover/feed:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all text-xs flex-shrink-0"
                      title="Delete feed"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Subreddits — drop target */}
                {!isCollapsed && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverFeedId(feed.id); }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDragOverFeedId(null);
                      }
                    }}
                    onDrop={() => handleDrop(feed.id)}
                    className={`pl-5 rounded transition-colors ${
                      isDragOver ? "bg-teal-950/40 ring-1 ring-teal-700/50" : ""
                    }`}
                  >
                    {feedSubs.map((sub) => {
                      const active = activeSubreddit === sub.toLowerCase();
                      const isDraggingThis = dragging?.sub === sub;
                      return (
                        <div
                          key={sub}
                          draggable
                          onDragStart={() => setDragging({ sub, fromFeedId: feed.id })}
                          onDragEnd={() => { setDragging(null); setDragOverFeedId(null); }}
                          className={`group/sub flex items-center gap-0.5 cursor-grab active:cursor-grabbing ${
                            isDraggingThis ? "opacity-40" : ""
                          }`}
                        >
                          <span className="text-gray-700 text-xs flex-shrink-0 select-none px-0.5">
                            ⠿
                          </span>
                          <Link
                            href={`/r/${sub}`}
                            className={`flex-1 px-1.5 py-1 rounded text-sm transition-colors truncate ${
                              active
                                ? "bg-teal-900/40 text-teal-300"
                                : "text-gray-300 hover:text-gray-100 hover:bg-gray-900"
                            }`}
                          >
                            r/{sub}
                          </Link>
                          <button
                            onClick={() => handleRemove(sub)}
                            className="opacity-0 group-hover/sub:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all text-xs flex-shrink-0"
                            aria-label={`Remove r/${sub}`}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}

                    {feedSubs.length === 0 && (
                      <p className="text-xs text-gray-700 px-1.5 py-1 italic">
                        {isDragOver ? "Drop here" : "Empty"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* New feed */}
          {creatingFeed ? (
            <div className="flex gap-1 pl-5 pt-1">
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFeed();
                  if (e.key === "Escape") { setCreatingFeed(false); setNewFeedName(""); }
                }}
                onBlur={() => { if (!newFeedName.trim()) setCreatingFeed(false); }}
                placeholder="Feed name"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-teal-600 min-w-0"
              />
              <button
                onClick={handleCreateFeed}
                className="px-2 py-1 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded transition-colors"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingFeed(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full"
            >
              <span>+</span>
              <span>New Feed</span>
            </button>
          )}
        </div>
      </nav>

      {/* Add subreddit — pinned to bottom */}
      <div className="p-3 border-t border-gray-800 space-y-1.5">
        <p className="text-xs text-gray-600">
          Adding to: <span className="text-gray-400">{activeFeed?.name}</span>
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="r/subreddit"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-teal-600 transition-colors min-w-0"
          />
          <button
            onClick={handleAdd}
            className="px-2 py-1 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded transition-colors font-medium flex-shrink-0"
          >
            Add
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </aside>
  );
}
