"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import AuthModal from "./AuthModal";
import styles from "./Header.module.css";

interface HeaderProps {
    onCreateClick?: () => void;
}

export default function Header({ onCreateClick }: HeaderProps) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <header className={styles.header}>
            <div className={`${styles.navContainer} container`}>
                <div className={styles.logo}>
                    <Link href="/" className={styles.logoLink}>
                        <Image src="/assets/logo_white.png" alt="Meme Supreme Icon" width={32} height={32} className={styles.logoIcon} />
                        <span className={styles.logoText}>eme <span className="text-gradient">Supreme</span></span>
                    </Link>
                </div>
                <nav className={styles.navLinks}>
                    <Link href="/terms" className={styles.navLink}>
                        Terms
                    </Link>

                    {/* MOCK AUTH BYPASS: Hidden in production, accessible in dev */}
                    {process.env.NODE_ENV === 'development' && (
                        loading ? (
                            <div className={styles.navLink}>...</div>
                        ) : user ? (
                            <div className={styles.userSection}>
                                <span className={styles.userEmail}>{user.email}</span>
                                <button
                                    className={styles.signOutBtn}
                                    onClick={handleSignOut}
                                >
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <button
                                className={styles.signInBtn}
                                onClick={() => router.push('/dashboard')}
                            >
                                Sign In
                            </button>
                        )
                    )}

                    <button
                        className={styles.ctaButton}
                        onClick={() => {
                            if (onCreateClick) {
                                onCreateClick();
                            } else {
                                const storeSection = document.getElementById("store");
                                if (storeSection) {
                                    storeSection.scrollIntoView({ behavior: "smooth" });
                                }
                            }
                        }}
                    >
                        Create
                    </button>
                </nav>
            </div>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
        </header>
    );
}
