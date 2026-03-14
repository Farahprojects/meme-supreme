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
            router.push("/studio");
            return;
        }

        if (pathname === '/') {
            const productsSection = document.getElementById("products");
            if (productsSection) {
                productsSection.scrollIntoView({ behavior: "smooth" });
            }
        } else {
            router.push('/#products');
        }
    };

    return (
        <>
            <aside className={styles.sidebar}>
                <div className={styles.topSection}>
                    <Link href="/" className={styles.logoLink} aria-label="Home">
                        <Image src="/assets/logo_white.png" alt="Meme Supreme Icon" width={32} height={32} className={styles.logoIcon} />
                    </Link>
                    <Link href="/library" className={styles.navIconLink} aria-label="Library" title="Library">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </Link>
                    {user && (
                        <Link href="/studio" className={styles.navIconLink} aria-label="Studio" title="Meme Studio">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                            </svg>
                        </Link>
                    )}
                    {user && (
                        <Link href="/studio/history" className={styles.navIconLink} aria-label="My Images" title="My Images">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="9" rx="1" />
                                <rect x="14" y="3" width="7" height="5" rx="1" />
                                <rect x="14" y="12" width="7" height="9" rx="1" />
                                <rect x="3" y="16" width="7" height="5" rx="1" />
                            </svg>
                        </Link>
                    )}
                    {user && (
                        <Link href="/studio/editor" className={styles.navIconLink} aria-label="Video Editor" title="Video Editor">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                        </Link>
                    )}
                    <Link href="/pricing" className={styles.navIconLink} aria-label="Pricing" title="Pricing">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                    </Link>

                    {process.env.NODE_ENV === "development" && (
                        <Link href="/dev/library-generator" className={styles.devLink} aria-label="Library Generator (Dev)" title="Seed Library (Dev)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                                <path d="M4.93 4.93a10 10 0 0 0 0 14.14"></path>
                            </svg>
                        </Link>
                    )}
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
