import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disconnect",
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
        <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800">
          <div className="max-w-2xl mx-auto px-4 h-12 flex items-center">
            <span className="font-bold text-white tracking-tight">Disconnect</span>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
