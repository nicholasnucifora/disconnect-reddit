"use client";

import PostCard from "@/components/PostCard";
import { useSavedPosts } from "@/lib/saved-posts";

export default function SavedPostsClient() {
  const { savedPosts } = useSavedPosts();

  if (savedPosts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/60 px-8 py-20 text-center">
        <p className="text-lg font-medium text-gray-200">No saved posts yet</p>
        <p className="mt-2 text-sm text-gray-500">
          Use the bookmark icon on any post to keep it here before opening it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {savedPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
