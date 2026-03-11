"use client";

import { notFound } from "next/navigation";
import { useState, useEffect } from "react";
import LibraryCard, { type LibraryTone } from "@/components/LibraryCard";
import styles from "./page.module.css";

const DEV_SECRET_KEY = "devLibrarySeederSecret";

const TONES: { value: LibraryTone; label: string }[] = [
    { value: "roast", label: "Roast" },
    { value: "funny", label: "Funny" },
    { value: "sweet", label: "Sweet" },
    { value: "bold", label: "Bold" },
];

interface SeederResult {
    id: string;
    image_url: string;
    caption: string;
    names: string | null;
    tone: LibraryTone;
}

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

export default function DevLibraryGeneratorPage() {
    if (process.env.NODE_ENV !== "development") {
        notFound();
    }

    const [targetNames, setTargetNames] = useState("");
    const [contextDesc, setContextDesc] = useState("");
    const [tone, setTone] = useState<LibraryTone>("roast");
    const [devSecret, setDevSecret] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<SeederResult[]>([]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(DEV_SECRET_KEY);
            if (saved) setDevSecret(saved);
        }
    }, []);

    const saveSecret = () => {
        if (typeof window !== "undefined" && devSecret) {
            localStorage.setItem(DEV_SECRET_KEY, devSecret);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!devSecret.trim()) {
            setError("Dev secret is required. Set DEV_SEEDER_SECRET in Supabase and enter it below.");
            return;
        }
        setLoading(true);
        try {
            const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/library-seeder`;
            const res = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                    "x-dev-secret": devSecret.trim(),
                },
                body: JSON.stringify({
                    target_names: targetNames.trim(),
                    context_description: contextDesc.trim(),
                    tone: tone,
                    dev_secret: devSecret.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `Request failed: ${res.status}`);
            }
            if (data.success && data.id) {
                setResults((prev) => [
                    {
                        id: data.id,
                        image_url: data.image_url,
                        caption: data.caption,
                        names: data.names ?? null,
                        tone: data.tone,
                    },
                    ...prev,
                ]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.wrap}>
            <header className={styles.header}>
                <h1 className={styles.title}>Library Seeder (Dev)</h1>
                <p className={styles.subtitle}>
                    Generate one meme at a time; image + caption are saved to <code>library_images</code> and <code>library-images</code> bucket. No VPS binding.
                </p>
            </header>

            <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.field}>
                    <label htmlFor="names">Target names</label>
                    <input
                        id="names"
                        type="text"
                        value={targetNames}
                        onChange={(e) => setTargetNames(e.target.value)}
                        placeholder="e.g. Nike, Sarah"
                        maxLength={200}
                        className={styles.input}
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="context">Context description</label>
                    <textarea
                        id="context"
                        value={contextDesc}
                        onChange={(e) => setContextDesc(e.target.value)}
                        placeholder="Describe the situation or vibe for the meme..."
                        maxLength={1000}
                        rows={4}
                        className={styles.textarea}
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="tone">Tone</label>
                    <select
                        id="tone"
                        value={tone}
                        onChange={(e) => setTone(e.target.value as LibraryTone)}
                        className={styles.select}
                    >
                        {TONES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.field}>
                    <label htmlFor="secret">Dev secret (DEV_SEEDER_SECRET)</label>
                    <div className={styles.secretRow}>
                        <input
                            id="secret"
                            type="password"
                            value={devSecret}
                            onChange={(e) => setDevSecret(e.target.value)}
                            placeholder="Set in Supabase Edge Function secrets"
                            className={styles.input}
                            autoComplete="off"
                        />
                        <button type="button" onClick={saveSecret} className={styles.saveSecretBtn}>
                            Save
                        </button>
                    </div>
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" disabled={loading} className={styles.submit}>
                    {loading ? "Generating…" : "Generate & save to library"}
                </button>
            </form>

            {results.length > 0 && (
                <section className={styles.results}>
                    <h2 className={styles.resultsTitle}>Generated this session</h2>
                    <div className={styles.grid}>
                        {results.map((r) => (
                            <LibraryCard
                                key={r.id}
                                imageUrl={thumbnailUrl(r.image_url)}
                                caption={r.caption}
                                names={r.names}
                                tone={r.tone}
                                alt={r.caption.slice(0, 80)}
                                thumbnail
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
