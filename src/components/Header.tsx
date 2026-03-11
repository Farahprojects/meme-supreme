"use client";

import { useState, useRef, useEffect } from "react";
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

                    {loading ? (
                        <div className={styles.navLink}>...</div>
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
                                        onClick={handleSignOut}
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <button
                                className={styles.signInBtn}
                                onClick={() => setIsAuthModalOpen(true)}
                            >
                                Sign In
                            </button>
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
                        </>
                    )}
                </nav>
            </div>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
        </header>
    );
}
