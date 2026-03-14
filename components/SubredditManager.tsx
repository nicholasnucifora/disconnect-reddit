"use client";

import { useState } from "react";

interface SubredditManagerProps {
  subreddits: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}

export default function SubredditManager({
  subreddits,
  onAdd,
  onRemove,
}: SubredditManagerProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const name = input.trim().replace(/^r\//, "");
    if (!name) {
      setError("Please enter a subreddit name.");
      return;
    }
    if (subreddits.map((s) => s.toLowerCase()).includes(name.toLowerCase())) {
      setError(`r/${name} is already in your list.`);
      return;
    }
    setError(null);
    onAdd(name);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAdd();
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
        Subreddits
      </h2>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="r/subredditname"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          aria-label="Subreddit name"
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors font-medium"
        >
          Add
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Subreddit list */}
      {subreddits.length === 0 ? (
        <p className="text-gray-500 text-sm">No subreddits added yet.</p>
      ) : (
        <ul className="space-y-1">
          {subreddits.map((sub) => (
            <li
              key={sub}
              className="flex items-center justify-between text-sm text-gray-200"
            >
              <span className="text-indigo-400">r/{sub}</span>
              <button
                onClick={() => onRemove(sub)}
                aria-label={`Remove r/${sub}`}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
