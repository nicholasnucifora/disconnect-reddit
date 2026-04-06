"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { USERNAME } from "@/lib/config";

interface SubredditsContextValue {
  subreddits: string[];
  ready: boolean;
  addSubreddit: (name: string) => Promise<void>;
  removeSubreddit: (name: string) => Promise<void>;
}

const SubredditsContext = createContext<SubredditsContextValue | null>(null);

export function SubredditsProvider({ children }: { children: ReactNode }) {
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("user_subreddits")
      .select("subreddit")
      .eq("username", USERNAME)
      .order("added_at", { ascending: true })
      .then(({ data }) => {
        setSubreddits((data ?? []).map((r: { subreddit: string }) => r.subreddit));
        setReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addSubreddit(name: string) {
    const { error } = await supabase
      .from("user_subreddits")
      .insert({ username: USERNAME, subreddit: name });
    if (!error) setSubreddits((prev) => [...prev, name]);
  }

  async function removeSubreddit(name: string) {
    const { error } = await supabase
      .from("user_subreddits")
      .delete()
      .eq("username", USERNAME)
      .eq("subreddit", name);
    if (!error) setSubreddits((prev) => prev.filter((s) => s !== name));
  }

  return (
    <SubredditsContext.Provider value={{ subreddits, ready, addSubreddit, removeSubreddit }}>
      {children}
    </SubredditsContext.Provider>
  );
}

export function useSubreddits() {
  const ctx = useContext(SubredditsContext);
  if (!ctx) throw new Error("useSubreddits must be used within SubredditsProvider");
  return ctx;
}
