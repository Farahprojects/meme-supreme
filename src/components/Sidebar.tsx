"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import AuthModal from "./AuthModal";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSignOut = async () => {
        setIsDropdownOpen(false);
        await supabase.auth.signOut();
        router.push('/');
    };

    const handleCreateClick = () => {
        if (user) {
            // Placeholder: Signed-in flow to be implemented
            console.log("Create clicked (signed-in flow pending)");
            return;
        }

        if (pathname === '/') {
            const storeSection = document.getElementById("store");
            if (storeSection) {
                storeSection.scrollIntoView({ behavior: "smooth" });
            }
        } else {
            router.push('/#store');
        }
    };

    return (
        <>
            <aside className={styles.sidebar}>
                <div className={styles.topSection}>
                    <Link href="/" className={styles.logoLink} aria-label="Home">
                        <Image src="/assets/logo_white.png" alt="Meme Supreme Icon" width={32} height={32} className={styles.logoIcon} />
                    </Link>
                </div>

                <div className={styles.bottomSection}>
                    <button
                        className={styles.createBtn}
                        onClick={handleCreateClick}
                        aria-label="Create Meme"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>

                    {loading ? (
                        <div className={styles.loadingAvatar}></div>
                    ) : user ? (
                        <div className={styles.userSection} ref={dropdownRef}>
                            <button
                                className={styles.userAvatarBtn}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                aria-label="User menu"
                            >
                                {user.email?.charAt(0).toUpperCase() || 'U'}
                            </button>

                            {isDropdownOpen && (
                                <div className={styles.dropdownMenu}>
                                    <div className={styles.dropdownHeader}>
                                        <span className={styles.dropdownEmail}>{user.email}</span>
                                    </div>
                                    <div className={styles.dropdownDivider}></div>
                                    <button
                                        className={styles.dropdownItem}
                                        onClick={() => { setIsDropdownOpen(false); router.push('/dashboard'); }}
                                    >
                                        Dashboard
                                    </button>
                                    <button
                                        className={styles.dropdownItem}
                                        onClick={() => { setIsDropdownOpen(false); router.push('/terms'); }}
                                    >
                                        Terms
                                    </button>
                                    <div className={styles.dropdownDivider}></div>
                                    <button
                                        className={styles.dropdownItem}
                                        onClick={handleSignOut}
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            className={styles.signInBtn}
                            onClick={() => setIsAuthModalOpen(true)}
                            aria-label="Sign In"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                <polyline points="10 17 15 12 10 7"></polyline>
                                <line x1="15" y1="12" x2="3" y2="12"></line>
                            </svg>
                        </button>
                    )}
                </div>
            </aside>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
        </>
    );
}
