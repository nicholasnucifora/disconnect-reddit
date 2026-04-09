import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { SubredditsProvider } from "@/lib/subreddits-context";
import { FeedsProvider } from "@/lib/feeds-context";
import { UsageProvider } from "@/lib/usage-provider";

export const metadata: Metadata = {
  title: "Disconnected Reddit",
  description: "A mindful Reddit reader",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        <SubredditsProvider>
          <FeedsProvider>
            <UsageProvider>
              <AppShell>{children}</AppShell>
            </UsageProvider>
          </FeedsProvider>
        </SubredditsProvider>
      </body>
    </html>
  );
}
