"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import styles from "./page.module.css";

const FREE_FEATURES = [
    "Full access to the Meme Library",
    "Edit any caption — unlimited rewrites",
    "Bind caption to image & download PNG",
    "Watermarked with memesupreme.co",
];

const STARTER_FEATURES = [
    "48 images per month (12 runs × 4 tones)",
    "Unlimited image tweaks & edits",
    "Unlimited caption rewrites",
    "5 AI-scripted reels per month (Beta)",
    "All 4 tones: Funny, Roast, Sweet, Bold",
    "PNG download on every image",
    "No watermark on generated images",
];

export default function PricingPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const handleSubscribe = () => {
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }
        // TODO: replace with Stripe checkout session redirect
        // router.push("/api/create-checkout-session");
        router.push("/studio");
    };

    return (
        <>
            {user ? <Sidebar /> : <Header />}

            <main className={`${styles.main} ${user ? styles.withSidebar : ""}`}>
                <div className={`${styles.pageInner} container`}>

                    <div className={styles.hero}>
                        <h1 className={styles.title}>
                            Simple pricing.<br />
                            <span className="text-gradient">Serious output.</span>
                        </h1>
                        <p className={styles.subtitle}>
                            Start free. Upgrade when you&apos;re ready to generate.
                        </p>
                    </div>

                    <div className={styles.cards}>
                        {/* Free Card */}
                        <div className={styles.card}>
                            <div className={styles.cardTop}>
                                <span className={styles.planName}>Free</span>
                                <div className={styles.priceRow}>
                                    <span className={styles.price}>$0</span>
                                    <span className={styles.period}>/month</span>
                                </div>
                                <p className={styles.planTagline}>
                                    Browse, remix, and download from the library. No sign-up required.
                                </p>
                            </div>

                            <ul className={styles.featureList}>
                                {FREE_FEATURES.map((f) => (
                                    <li key={f} className={styles.featureItem}>
                                        <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Link href="/library" className={styles.ctaSecondary}>
                                Browse Library
                            </Link>
                        </div>

                        {/* Starter Card */}
                        <div className={`${styles.card} ${styles.cardFeatured}`}>
                            <div className={styles.popularBadge}>Most Popular</div>

                            <div className={styles.cardTop}>
                                <span className={styles.planName}>Starter</span>
                                <div className={styles.priceRow}>
                                    <span className={styles.price}>$19</span>
                                    <span className={styles.period}>/month</span>
                                </div>
                                <p className={styles.planTagline}>
                                    Built for creators who need consistent weekly content without the grind.
                                </p>
                            </div>

                            <ul className={styles.featureList}>
                                {STARTER_FEATURES.map((f) => (
                                    <li key={f} className={styles.featureItem}>
                                        <svg className={`${styles.check} ${styles.checkFeatured}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <button
                                className={styles.ctaPrimary}
                                onClick={handleSubscribe}
                                disabled={loading}
                            >
                                {loading ? "Loading..." : user ? "Go to Studio" : "Get Started — $19/mo"}
                            </button>

                            <p className={styles.cardNote}>Cancel anytime. No lock-in.</p>
                        </div>
                    </div>

                    <div className={styles.footer}>
                        <p className={styles.footerNote}>
                            Questions? <a href="mailto:hello@memesupreme.co" className={styles.footerLink}>hello@memesupreme.co</a>
                        </p>
                    </div>
                </div>
            </main>

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </>
    );
}
