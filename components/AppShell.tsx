"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NavBar from "./NavBar";
import Sidebar from "./Sidebar";
import FocusGuard from "./FocusGuard";
import UsageGate from "./UsageGate";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <FocusGuard>
      <>
        <NavBar onMenuClick={() => setSidebarOpen((open) => !open)} />

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="pt-14 md:pt-16 md:pl-60">
          <UsageGate>{children}</UsageGate>
        </div>
      </>
    </FocusGuard>
  );
}
