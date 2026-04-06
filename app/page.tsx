import FeedClient from "@/components/FeedClient";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <FeedClient />
      </div>
    </main>
  );
}
