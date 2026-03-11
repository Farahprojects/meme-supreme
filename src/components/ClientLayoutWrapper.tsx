"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // Use the Header for the landing page
    const isLandingPage = pathname === "/";

    if (isLandingPage) {
        return (
            <div className="landing-layout">
                <Header />
                <main>{children}</main>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                {children}
            </div>
        </div>
    );
}
