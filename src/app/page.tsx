"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MemeCard from "@/components/MemeCard";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import styles from "./page.module.css";

// Mock data for the hero / feed
const FEED_MEMES = [
  { id: 1, type: "Roast", url: "/assets/memes/brand.jpg" },
  { id: 2, type: "Sweet", url: "/assets/memes/couplesweet.jpg" },
  { id: 3, type: "Bold", url: "/assets/memes/brand1.jpg" },
  { id: 4, type: "Funny", url: "/assets/memes/restone.jpg" },
  { id: 5, type: "Funny", url: "/assets/memes/content.jpg" },
  { id: 6, type: "Roast", url: "/assets/memes/brand.jpg" },
  { id: 7, type: "Funny", url: "/assets/memes/singel1.jpg" },
  { id: 8, type: "Funny", url: "/assets/memes/singel.jpg" },
];

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  // For the continuous scroll effect, duplicate the feed array
  const scrollingFeed = [...FEED_MEMES, ...FEED_MEMES];

  return (
    <main className={styles.main}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.headline}>
              Content that <span className="text-gradient">hits different.</span>
            </h1>
            <p className={styles.subtext}>
              From a single idea to something the feed can&apos;t ignore. For brands, creators, and anyone with a story worth telling.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/library" className={styles.heroCtaSecondary}>
                Browse Library
              </Link>
              <button
                className={styles.heroCta}
                onClick={() => setIsAuthModalOpen(true)}
              >
                Start Creating
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Live Meme Feed (Scrolling Social Proof) */}
      <section id="feed" className={styles.feedSection}>
        <div className={styles.scrollTrack}>
          <div className={styles.scrollContent}>
            {scrollingFeed.map((meme, idx) => (
              <div key={`${meme.id}-${idx}`} className={styles.feedItem}>
                <MemeCard
                  imageUrl={meme.url}
                  type={meme.type}
                  alt={`${meme.type} example`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className={`${styles.productsSection} container`}>
        <div className={styles.productsHeader}>
          <h2 className={styles.sectionTitle}>What you get</h2>
          <p className={styles.sectionSub}>One prompt. Memes, reels, and a library to remix.</p>
        </div>
        <div className={styles.productCards}>
          <div className={styles.productCard}>
            <div className={styles.productIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <h3 className={styles.productHeadline}>Library</h3>
            <p className={styles.productSub}>Free. Browse, remix, download.</p>
            <Link href="/library" className={styles.productCta}>
              Browse Library
            </Link>
          </div>
          <div className={styles.productCard}>
            <div className={styles.productIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
              </svg>
            </div>
            <h3 className={styles.productHeadline}>Studio</h3>
            <p className={styles.productSub}>4 memes. One idea. Every tone.</p>
            <button type="button" className={styles.productCta} onClick={() => setIsAuthModalOpen(true)}>
              Start Creating
            </button>
          </div>
          <div className={styles.productCard}>
            <div className={styles.productIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h3 className={styles.productHeadline}>Reels <span className={styles.betaBadge}>Beta</span></h3>
            <p className={styles.productSub}>AI-scripted reels. 15 seconds.</p>
            <button type="button" className={styles.productCta} onClick={() => setIsAuthModalOpen(true)}>
              Try Reels
            </button>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="container">
          <p>© 2026 MemeSupreme. All rights reserved. No refunds for hurt feelings.</p>
          <div className={styles.footerLinks}>
            <Link href="/pricing" className={styles.footerButton}>Pricing</Link>
            <Link href="/terms" className={styles.footerButton}>Terms</Link>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </main>
  );
}
