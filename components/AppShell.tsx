"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NavBar from "./NavBar";
import Sidebar from "./Sidebar";
import UsageGate from "./UsageGate";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <>
      <NavBar onMenuClick={() => setSidebarOpen((o) => !o)} />

      {/* Backdrop — mobile only, behind drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} />

      {/* Main content — full width on mobile, offset by sidebar on desktop */}
      <div className="md:pl-60 pt-16">
        <UsageGate>{children}</UsageGate>
      </div>
    </>
  );
}
