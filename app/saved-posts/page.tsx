import SavedPostsClient from "@/components/SavedPostsClient";

export default function SavedPostsPage() {
  return (
    <main className="min-h-screen bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-white">Saved Posts</h1>
          <p className="mt-2 text-sm text-gray-500">
            Posts you bookmark stay here even after they disappear from your feed.
          </p>
        </div>
        <SavedPostsClient />
      </div>
    </main>
  );
}
