"use client";

import { useState } from "react";
import Image from "next/image";
import supabaseLoader from "@/lib/supabase-image-loader";
import styles from "./LibraryCard.module.css";

export type LibraryTone = "roast" | "funny" | "sweet" | "bold";

export interface LibraryCardProps {
    imageUrl: string;
    caption: string;
    names?: string | null;
    tone: LibraryTone;
    alt?: string;
    onClick?: () => void;
    /** When true, use thumbnail dimensions for Next/Image (grid). When false, fill container (modal). */
    thumbnail?: boolean;
}

export default function LibraryCard({
    imageUrl,
    caption,
    names,
    tone,
    alt = "Library meme",
    onClick,
    thumbnail = true,
}: LibraryCardProps) {
    const toneLabel = tone.charAt(0).toUpperCase() + tone.slice(1);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation(); // don't trigger card click / modal open
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error("Failed to fetch image");
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = blobUrl;
            a.download = `meme-supreme-${tone}-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch {
            alert("Download failed. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <article
            className={styles.card}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
        >
            <div className={styles.imageWrapper}>
                <Image
                    src={imageUrl}
                    alt={alt}
                    fill
                    className={styles.image}
                    sizes={thumbnail ? "400px" : "100vw"}
                    loader={supabaseLoader}
                />
                <div className={styles.scrimTop} aria-hidden />
                <div className={styles.scrimBottom} aria-hidden />
                {names && (
                    <div className={styles.namesText}>{names}</div>
                )}
                <div className={styles.captionText}>{caption}</div>
                <div className={styles.logoWrap}>
                    <Image
                        src="/assets/logo_white.png"
                        alt=""
                        fill
                        className={styles.logo}
                        sizes="28px"
                    />
                </div>
                <span className={styles.toneBadge}>{toneLabel}</span>
                <button
                    className={styles.downloadBtn}
                    onClick={handleDownload}
                    disabled={isDownloading}
                    aria-label="Download image"
                    title="Download"
                >
                    {isDownloading ? (
                        <span className={styles.downloadSpinner} />
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    )}
                </button>
            </div>
        </article>
    );
}
