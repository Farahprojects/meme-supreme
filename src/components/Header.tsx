"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./Header.module.css";

interface HeaderProps {
    onCreateClick?: () => void;
}

export default function Header({ onCreateClick }: HeaderProps) {
    return (
        <header className={styles.header}>
            <div className={`${styles.navContainer} container`}>
                <div className={styles.logo}>
                    <Link href="/" className={styles.logoLink}>
                        <Image src="/assets/logo_white.png" alt="Meme Supreme Icon" width={32} height={32} className={styles.logoIcon} />
                        <span className={styles.logoText}>eme<span className="text-gradient">Supreme</span></span>
                    </Link>
                </div>
                <nav className={styles.navLinks}>
                    <Link href="/terms" className="text-gray-300 hover:text-white transition-colors mr-6 text-sm font-medium">
                        Terms
                    </Link>
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
        </header>
    );
}
