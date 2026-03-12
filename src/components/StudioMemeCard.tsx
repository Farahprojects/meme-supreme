"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import supabaseLoader from "@/lib/supabase-image-loader";
import styles from "./StudioMemeCard.module.css";

export type StudioTone = "roast" | "funny" | "sweet" | "bold";

export interface StudioMemeCardProps {
    meme_id: string;
    image_url: string;
    caption: string;
    names?: string | null;
    tone: StudioTone;
    /** Called when user clicks Regenerate; parent refires studio-generator for this tone. */
    onRegenerate: () => void;
    /** Called when caption text changes (parent may persist). */
    onCaptionChange?: (caption: string) => void;
    /** Called when names text changes (parent may persist). */
    onNamesChange?: (names: string) => void;
    /** Called when user clicks Download; parent calls library-bind with (image_url, names, caption) and triggers download. */
    onDownload: (imageUrl: string, names: string, caption: string) => Promise<void>;
    /** When true, show loading spinner instead of content. */
    loading?: boolean;
}

export default function StudioMemeCard({
    meme_id,
    image_url,
    caption: initialCaption,
    names: initialNames,
    tone,
    onRegenerate,
    onCaptionChange,
    onNamesChange,
    onDownload,
    loading = false,
}: StudioMemeCardProps) {
    const [caption, setCaption] = useState(initialCaption);
    const [names, setNames] = useState(initialNames ?? "");
    const [isDownloading, setIsDownloading] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);

    useEffect(() => {
        setCaption(initialCaption);
        setNames(initialNames ?? "");
    }, [initialCaption, initialNames, meme_id]);

    const toneLabel = tone.charAt(0).toUpperCase() + tone.slice(1);

    const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        setCaption(v);
        onCaptionChange?.(v);
    };
    const handleNamesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setNames(v);
        onNamesChange?.(v);
    };

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            await onDownload(image_url, names.trim(), caption.trim());
        } catch {
            alert("Download failed. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleRegenerate = () => {
        if (isRegenerating) return;
        setIsRegenerating(true);
        onRegenerate();
    };

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.imageWrapper}>
                    <div className={styles.loadingPlaceholder} />
                    <span className={styles.toneBadge}>{toneLabel}</span>
                    <div className={styles.spinnerWrap}>
                        <span className={styles.spinner} aria-hidden />
                        <span className={styles.loadingText}>Generating…</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <article className={styles.card}>
            <div className={styles.imageWrapper}>
                <Image
                    src={image_url}
                    alt=""
                    fill
                    className={styles.image}
                    sizes="400px"
                    loader={supabaseLoader}
                />
                <div className={styles.scrimTop} aria-hidden />
                <div className={styles.scrimBottom} aria-hidden />
                <input
                    type="text"
                    className={styles.namesInput}
                    value={names}
                    onChange={handleNamesChange}
                    placeholder="Names"
                    aria-label="Edit names"
                />
                <textarea
                    className={styles.captionInput}
                    value={caption}
                    onChange={handleCaptionChange}
                    placeholder="Caption"
                    aria-label="Edit caption"
                    rows={3}
                />
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
                    type="button"
                    className={styles.downloadBtn}
                    onClick={handleDownload}
                    disabled={isDownloading}
                    aria-label="Download with caption"
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
                <button
                    type="button"
                    className={styles.regenerateBtn}
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    aria-label="Regenerate this meme"
                    title="Regenerate"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                </button>
            </div>
        </article>
    );
}
