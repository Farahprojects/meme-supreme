"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "@/hooks/useAuth";

// Routes that show the public Header when the user is NOT signed in
const PUBLIC_ROUTES = ["/", "/library", "/terms"];

function isPublicRoute(pathname: string) {
    return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/library");
}

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading } = useAuth();

    // Signed-in users always get the Sidebar on every page
    if (!loading && user) {
        return (
            <div className="app-layout">
                <Sidebar />
                <div className="main-content">
                    {children}
                </div>
            </div>
        );
    }

    // Not signed in: public routes get the Header, everything else gets the Sidebar
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
