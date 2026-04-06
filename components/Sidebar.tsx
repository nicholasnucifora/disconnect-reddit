"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSubreddits } from "@/lib/subreddits-context";

export default function Sidebar() {
  const { subreddits, addSubreddit, removeSubreddit } = useSubreddits();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  function handleAdd() {
    const name = input.trim().replace(/^r\//, "");
    if (!name) {
      setError("Enter a subreddit name");
      return;
    }
    if (subreddits.map((s) => s.toLowerCase()).includes(name.toLowerCase())) {
      setError(`r/${name} already added`);
      return;
    }
    setError(null);
    addSubreddit(name);
    setInput("");
  }

  const isHome = pathname === "/";
  const activeSubreddit = pathname.match(/^\/r\/([^/]+)/)?.[1]?.toLowerCase();

  return (
    <aside className="fixed top-12 left-0 w-52 h-[calc(100vh-48px)] overflow-y-auto bg-gray-950 border-r border-gray-800 flex flex-col z-40">
      <nav className="flex-1 p-3 space-y-0.5">
        {/* Home */}
        <Link
          href="/"
          className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
            isHome
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-gray-100 hover:bg-gray-900"
          }`}
        >
          <span>⌂</span>
          <span>Home Feed</span>
        </Link>

        {subreddits.length > 0 && (
          <div className="pt-3">
            <p className="text-xs text-gray-600 uppercase tracking-widest px-2 pb-1.5">
              Subreddits
            </p>
            {subreddits.map((sub) => {
              const active = activeSubreddit === sub.toLowerCase();
              return (
                <div key={sub} className="group flex items-center gap-0.5">
                  <Link
                    href={`/r/${sub}`}
                    className={`flex-1 px-2 py-1.5 rounded text-sm transition-colors truncate ${
                      active
                        ? "bg-teal-900/40 text-teal-300"
                        : "text-gray-300 hover:text-gray-100 hover:bg-gray-900"
                    }`}
                  >
                    r/{sub}
                  </Link>
                  <button
                    onClick={() => removeSubreddit(sub)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all text-xs flex-shrink-0"
                    aria-label={`Remove r/${sub}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Add form pinned to bottom */}
      <div className="p-3 border-t border-gray-800 space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
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
