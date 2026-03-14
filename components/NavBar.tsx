"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface NavBarProps {
  email: string | null;
}

export default function NavBar({ email }: NavBarProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <span className="font-bold text-white tracking-tight">Disconnect</span>

        <div className="flex items-center gap-3">
          {email ? (
            <>
              <span className="text-gray-400 text-xs hidden sm:block">
                {email}
              </span>
              <button
                onClick={handleSignOut}
                className="text-xs text-gray-400 hover:text-gray-100 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
