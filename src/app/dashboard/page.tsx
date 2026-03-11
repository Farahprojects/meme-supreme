"use client";

import { useAuth } from "@/hooks/useAuth";
import styles from "./page.module.css";
import DashboardChatBar from "@/components/DashboardChatBar";

export default function Dashboard() {
    const { user, loading } = useAuth();
    const displayEmail = user?.email || "test-user@example.com";

    return (
        <main className={styles.main}>
            <div className={`${styles.content} container`}>
                <div className={styles.heroSection}>
                    <h1 className={styles.title}>Welcome, <span className="text-gradient">{displayEmail.split('@')[0]}</span></h1>
                </div>

                <DashboardChatBar />
            </div>
        </main>
    );
}
