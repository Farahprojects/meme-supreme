"use client";

import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
    return (
        <header className={styles.header}>
            <div className={`${styles.navContainer} container`}>
                <div className={styles.logo}>
                    <Link href="/">
                        Meme<span className="text-gradient">Roast</span>
                    </Link>
                </div>
                <nav className={styles.navLinks}>
                    <Link href="#feed" className={styles.link}>
                        Explore Feed
                    </Link>
                    <button
                        className={styles.ctaButton}
                        onClick={() => {
                            const storeSection = document.getElementById("store");
                            if (storeSection) {
                                storeSection.scrollIntoView({ behavior: "smooth" });
                            }
                        }}
                    >
                        Create Meme
                    </button>
                </nav>
            </div>
        </header>
    );
}
