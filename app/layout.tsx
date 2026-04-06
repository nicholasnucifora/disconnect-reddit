import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import { SubredditsProvider } from "@/lib/subreddits-context";

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
          <NavBar />
          <Sidebar />
          <div className="pl-52 pt-12">
            {children}
          </div>
        </SubredditsProvider>
      </body>
    </html>
  );
}
