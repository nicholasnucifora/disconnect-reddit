"use client";

import { useParams } from "next/navigation";
import SubredditFeed from "@/components/SubredditFeed";

export default function SubredditPage() {
  const params = useParams();
  const subreddit = params.subreddit as string;
  return <SubredditFeed subreddit={subreddit} />;
}
