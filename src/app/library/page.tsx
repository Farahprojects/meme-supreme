"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import LibraryCard, { type LibraryTone } from "@/components/LibraryCard";
import styles from "./page.module.css";

export interface LibraryImageRow {
    id: string;
    image_url: string;
    tone: string;
    caption: string;
    names: string | null;
    is_published: boolean;
    created_at: string;
}

const TONES: { value: "all" | LibraryTone; label: string }[] = [
    { value: "all", label: "All" },
    { value: "roast", label: "Roast" },
    { value: "funny", label: "Funny" },
    { value: "sweet", label: "Sweet" },
    { value: "bold", label: "Bold" },
];

function thumbnailUrl(fullUrl: string): string {
    if (fullUrl.startsWith("/")) return fullUrl;
    try {
        const url = new URL(fullUrl);
        if (url.pathname.includes("/storage/v1/object/public/")) {
            const renderPath = url.pathname.replace(
                "/storage/v1/object/public/",
                "/storage/v1/render/image/public/"
            );
            url.pathname = renderPath;
            url.searchParams.set("width", "400");
            url.searchParams.set("height", "572");
            url.searchParams.set("quality", "75");
            return url.toString();
        }
    } catch {
        // ignore
    }
    return fullUrl;
}

export default function LibraryPage() {
    const { user } = useAuth();
    const [items, setItems] = useState<LibraryImageRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | LibraryTone>("all");
    const [selected, setSelected] = useState<LibraryImageRow | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, error: e } = await supabase
            .from("library_images")
            .select("id, image_url, tone, caption, names, is_published, created_at")
            .eq("is_published", true)
            .order("created_at", { ascending: false });

        if (e) {
            setError(e.message);
            setItems([]);
        } else {
            setItems((data as LibraryImageRow[]) ?? []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const filtered =
        filter === "all"
            ? items
            : items.filter((row) => row.tone === filter);

    const closeModal = useCallback(() => setSelected(null), []);

    useEffect(() => {
        if (!selected) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeModal();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected, closeModal]);

    return (
        <div className={styles.wrap}>
            <header className={styles.header}>
                <h1 className={styles.title}>
                    Meme <span className="text-gradient">Library</span>
                </h1>
                <p className={styles.subtitle}>
                    Free images to use. Change the caption, bind, and share.
                </p>
                <div className={styles.tabs} role="tablist">
                    {TONES.map(({ value, label }) => (
                        <button
                            key={value}
                            role="tab"
                            aria-selected={filter === value}
                            className={filter === value ? styles.tabActive : styles.tab}
                            onClick={() => setFilter(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {error && (
                <div className={styles.error}>
                    Could not load library. {error}
                </div>
            )}

            {loading && (
                <div className={styles.loading}>Loading…</div>
            )}

            {!loading && !error && filtered.length === 0 && (
                <div className={styles.empty}>
                    No memes in the library yet. Check back soon.
                </div>
            )}

            {!loading && !error && filtered.length > 0 && (
                <div className={styles.grid}>
                    {filtered.map((row) => (
                        <LibraryCard
                            key={row.id}
                            imageUrl={thumbnailUrl(row.image_url)}
                            caption={row.caption}
                            names={row.names}
                            tone={row.tone as LibraryTone}
                            alt={row.caption.slice(0, 80)}
                            thumbnail
                            onClick={() => setSelected(row)}
                        />
                    ))}
                </div>
            )}

            {selected && (
                <div
                    className={`${styles.modalOverlay} ${user ? styles.modalOverlaySignedIn : ""}`}
                    onClick={closeModal}
                    role="dialog"
                    aria-modal="true"
                    aria-label="View meme"
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={styles.modalClose}
                            onClick={closeModal}
                            aria-label="Close"
                        >
                            ×
                        </button>
                        <LibraryCard
                            imageUrl={selected.image_url}
                            caption={selected.caption}
                            names={selected.names}
                            tone={selected.tone as LibraryTone}
                            alt={selected.caption.slice(0, 80)}
                            thumbnail={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
