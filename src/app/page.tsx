"use client";

import { useState } from "react";
import Header from "@/components/Header";
import MemeCard from "@/components/MemeCard";
import ProductCard from "@/components/ProductCard";
import PurchaseModal from "@/components/PurchaseModal";
import styles from "./page.module.css";

// Mock data for the hero / feed
const FEED_MEMES = [
  { id: 1, type: "Single Roast", url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=600&auto=format&fit=crop" },
  { id: 2, type: "Couple Roast", url: "https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=600&auto=format&fit=crop" },
  { id: 3, type: "Astro Roast", url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop" },
  { id: 4, type: "Friend Roast", url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=600&auto=format&fit=crop" },
  { id: 5, type: "Group Roast", url: "https://images.unsplash.com/photo-1523301343968-6a6ebf63c672?q=80&w=600&auto=format&fit=crop" },
  { id: 6, type: "Single Roast", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=600&auto=format&fit=crop" },
  { id: 7, type: "Custom Roast", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop" },
  { id: 8, type: "Astro Roast", url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=600&auto=format&fit=crop" },
];

// Mock data for the store
const STORE_PRODUCTS = [
  {
    id: "single",
    title: "Single Roast",
    type: "Personal Attack",
    description: "Get ruthlessly evaluated based on your name, vibe, and any other info you provide.",
    price: "$2.99",
    previewUrl: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=600&auto=format&fit=crop"
  },
  {
    id: "couple",
    title: "Couple Roast",
    type: "Relationship Tester",
    description: "Find out who is settling and why your relationship dynamic is fundamentally flawed.",
    price: "$4.99",
    previewUrl: "https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=600&auto=format&fit=crop"
  },
  {
    id: "astro",
    title: "Astro Roast",
    type: "Cosmic Callout",
    description: "Blame your chaotic life choices on the stars. We will tell you exactly why your sign sucks.",
    price: "$3.99",
    previewUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600&auto=format&fit=crop"
  },
  {
    id: "friend",
    title: "Friend Roast",
    type: "Friendly Fire",
    description: "Send this to the group chat to destroy that one friend who never pays you back.",
    price: "$2.99",
    previewUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=600&auto=format&fit=crop"
  },
  {
    id: "group",
    title: "Group Roast",
    type: "Collateral Damage",
    description: "Take down the entire squad at once. Provide context, we provide the destruction.",
    price: "$6.99",
    previewUrl: "https://images.unsplash.com/photo-1523301343968-6a6ebf63c672?q=80&w=600&auto=format&fit=crop"
  },
  {
    id: "custom",
    title: "Custom Roast",
    type: "Highly Specific",
    description: "Have a very specific situation? Give us the tea and we will brew the perfect roast.",
    price: "$8.99",
    previewUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop"
  }
];

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<typeof STORE_PRODUCTS[0] | null>(null);

  // For the continuous scroll effect, duplicate the feed array
  const scrollingFeed = [...FEED_MEMES, ...FEED_MEMES];

  return (
    <main className={styles.main}>
      <Header />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <h1 className={styles.headline}>
              Get <span className="text-gradient">Roasted.</span>
            </h1>
            <p className={styles.subtext}>
              AI-generated memes about you, your friends, or your relationship. No filters. No mercy.
            </p>
            <button
              className={styles.heroCta}
              onClick={() => document.getElementById("store")?.scrollIntoView({ behavior: "smooth" })}
            >
              Shop Roasts
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
          <h2 className={styles.sectionTitle}>The Roast Store</h2>
          <p className={styles.sectionSub}>Pick your poison. Immediate digital delivery.</p>
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

      <footer className={styles.footer}>
        <div className="container">
          <p>© 2026 MemeRoast. All rights reserved. No refunds for hurt feelings.</p>
        </div>
      </footer>

      {/* Purchase Flow Modal */}
      <PurchaseModal
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        selectedProduct={selectedProduct}
      />
    </main>
  );
}
