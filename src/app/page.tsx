"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import MemeCard from "@/components/MemeCard";
import ProductCard from "@/components/ProductCard";
import PurchaseModal from "@/components/PurchaseModal";
import { useMemeHistory, MemeRecord } from "@/hooks/useMemeHistory";
import styles from "./page.module.css";
import Image from "next/image";

// Mock data for the hero / feed
const FEED_MEMES = [
  { id: 1, type: "Brand Roast", url: "/assets/memes/brand.jpg" },
  { id: 2, type: "Couple Roast", url: "/assets/memes/1770966675947-ff4927ed-e1df-416a-a6c8-7ab443f0ad74.jpg" },
  { id: 3, type: "Brand Funny", url: "/assets/memes/brand1.jpg" },
  { id: 4, type: "Restaurant funny", url: "/assets/memes/restone.jpg" },
  { id: 5, type: "Creator Funny", url: "/assets/memes/content.jpg" },
  { id: 6, type: "Brand Roast", url: "/assets/memes/brand.jpg" },
  { id: 7, type: "Birth Date Funny", url: "/assets/memes/singel1.jpg" },
  { id: 8, type: "Custom Funny", url: "/assets/memes/singel.jpg" },
];

// Mock data for the store
const STORE_PRODUCTS = [
  {
    id: "single",
    title: "Brand Roast",
    type: "Personal Attack",
    description: "Get ruthlessly evaluated based on your name, vibe, and any other info you provide.",
    price: "$1.00",
    previewUrl: "/assets/memes/brand.jpg"
  },
  {
    id: "couple",
    title: "Couple Roast",
    type: "Relationship Tester",
    description: "Find out who is settling and why your relationship dynamic is fundamentally flawed.",
    price: "$1.00",
    previewUrl: "/assets/memes/1770966675947-ff4927ed-e1df-416a-a6c8-7ab443f0ad74.jpg"
  }
];

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<typeof STORE_PRODUCTS[0] | null>(null);
  const [viewerMeme, setViewerMeme] = useState<MemeRecord | null>(null);
  const { history, removeMeme, clearHistory } = useMemeHistory();
  const [initialOrderId, setInitialOrderId] = useState<string | undefined>();
  const [initialStep, setInitialStep] = useState<"checkout" | "details" | "generating" | "result" | undefined>();

  // Detect Stripe Success Return
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const isSuccess = urlParams.get("success") === "true";
      const orderId = urlParams.get("order_id");

      if (isSuccess && orderId) {
        // Find the default product or map it from the URL if needed later
        setSelectedProduct(STORE_PRODUCTS[0]);
        setInitialOrderId(orderId);
        setInitialStep("details");

        // Clean up URL
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);

  // For the continuous scroll effect, duplicate the feed array
  const scrollingFeed = [...FEED_MEMES, ...FEED_MEMES];

  return (
    <main className={styles.main}>
      <Header onCreateClick={() => setSelectedProduct(STORE_PRODUCTS[0])} />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.headline}>
              Meme <span className="text-gradient">Your Life.</span>
            </h1>
            <p className={styles.subtext}>
              AI-generated memes for every vibe. Funny, Roast, Sweet, or Bold we&apos;ve got you covered.
            </p>
            <button
              className={styles.heroCta}
              onClick={() => document.getElementById("store")?.scrollIntoView({ behavior: "smooth" })}
            >
              Shop the Studio
            </button>
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

      {/* Meme Store Section */}
      <section id="store" className={`${styles.storeSection} container`}>
        <div className={styles.storeHeader}>
          <h2 className={styles.sectionTitle}>MemeSupreme Studio</h2>
          <p className={styles.sectionSub}>Funny. Roast. Sweet. Bold. Any vibe for just $1.</p>
        </div>

        <div className={styles.grid}>
          {STORE_PRODUCTS.map((product) => (
            <ProductCard
              key={product.id}
              title={product.title}
              description={product.description}
              price={product.price}
              previewUrl={product.previewUrl}
              onSelect={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      </section>

      {/* Meme Vault Section */}
      <section id="vault" className={`${styles.storeSection} container`} style={{ marginTop: '32px' }}>
        <div className={styles.storeHeader} style={{ position: 'relative' }}>
          <h2 className={styles.sectionTitle}>Your Meme Vault</h2>
          <p className={styles.sectionSub}>All your glorious creations, saved locally.</p>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255,255,255,0.1)', color: '#aaa', padding: '8px 16px', border: 'none', borderRadius: '100px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Clear Vault
            </button>
          )}
        </div>

        <div className={styles.grid}>
          {history.length === 0 ? (
            <div
              className={styles.emptyVaultCard}
              onClick={() => setSelectedProduct(STORE_PRODUCTS[0])}
            >
              <div className={styles.emptyVaultIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              </div>
              <h3 className={styles.emptyVaultTitle}>Your vault is empty</h3>
              <p className={styles.emptyVaultSub}>Create your first meme to start your collection.</p>
              <button className={styles.emptyVaultCta}>Create Meme</button>
            </div>
          ) : (
            history.map((meme) => (
              <div
                key={meme.id + meme.timestamp}
                className={styles.vaultCard}
                onClick={() => setViewerMeme(meme)}
              >
                <div className={styles.vaultImageContainer}>
                  <Image
                    src={meme.url}
                    alt="Saved meme"
                    className={styles.vaultImage}
                    width={500}
                    height={500}
                    style={{ objectFit: 'cover' }}
                    unoptimized
                  />
                  <div className={styles.vaultBadge}>{meme.tone}</div>
                  <div className={styles.vaultCardOverlay}>
                    <a
                      href={meme.url}
                      download={`meme-${meme.timestamp}.jpg`}
                      className={styles.vaultIconBtn}
                      onClick={(e) => e.stopPropagation()}
                      title="Download Meme"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                    <button
                      className={styles.vaultIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(meme.url);
                        alert("Link copied to clipboard!");
                      }}
                      title="Copy Link"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    </button>
                    <button
                      className={styles.vaultIconBtn}
                      onClick={(e) => { e.stopPropagation(); removeMeme(meme.timestamp); }}
                      title="Delete Meme"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Meme Viewer Popup (Just for viewing image) */}
      {viewerMeme && (
        <div className={styles.viewerOverlay} onClick={() => setViewerMeme(null)}>
          <div className={styles.viewerModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.viewerClose} onClick={() => setViewerMeme(null)}>✕</button>
            <div className={styles.viewerImageContainer}>
              <Image src={viewerMeme.url} alt="Vault Meme" fill className={styles.viewerImage} unoptimized />
            </div>
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <div className="container">
          <p>© 2026 MemeSupreme. All rights reserved. No refunds for hurt feelings.</p>
        </div>
      </footer>

      {/* Purchase Flow Modal */}
      <PurchaseModal
        isOpen={!!selectedProduct}
        onClose={() => {
          setSelectedProduct(null);
          setInitialOrderId(undefined);
          setInitialStep(undefined);
        }}
        selectedProduct={selectedProduct}
        initialOrderId={initialOrderId}
        initialStep={initialStep}
      />
    </main>
  );
}
