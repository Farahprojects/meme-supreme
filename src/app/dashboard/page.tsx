"use client";

import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();

    /* 
    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        }
    }, [user, loading, router]);
    */

    // if (loading) return <div className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Loading...</p></div>;
    // For manual testing/flow design, we allow the dashboard to render even if user is null
    const displayEmail = user?.email || "test-user@example.com";

    return (
        <main className={styles.main}>
            <Header />
            <div className={`${styles.content} container`}>
                <div className={styles.heroSection}>
                    <h1 className={styles.title}>Welcome, <span className="text-gradient">{displayEmail.split('@')[0]}</span></h1>
                    <p className={styles.subtitle}>Manage your memes, credits, and creations all in one place.</p>
                </div>

                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <h3>Your Memes</h3>
                        <p className={styles.statValue}>0</p>
                    </div>
                    <div className={styles.statCard}>
                        <h3>Credits</h3>
                        <p className={styles.statValue}>0</p>
                    </div>
                </div>

                <div className={styles.actionsBox}>
                    <button
                        className={styles.primaryBtn}
                        onClick={() => router.push("/")}
                    >
                        Create New Meme
                    </button>
                </div>
            </div>
        </main>
    );
}
