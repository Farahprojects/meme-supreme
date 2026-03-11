"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

// These routes are public-facing and use the top Header, not the app Sidebar
const PUBLIC_ROUTES = ["/", "/library", "/terms"];

function isPublicRoute(pathname: string) {
    return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/library");
}

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (isPublicRoute(pathname)) {
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
