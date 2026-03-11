"use client";

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
            </div>
        </article>
    );
}
