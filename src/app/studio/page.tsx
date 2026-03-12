"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import StudioMemeCard, { type StudioTone } from "@/components/StudioMemeCard";
import styles from "./page.module.css";

const TONES: StudioTone[] = ["roast", "funny", "sweet", "bold"];

export interface MemeResult {
    meme_id: string;
    image_url: string;
    caption: string;
    tone: string;
    names?: string | null;
}

type ResultState = MemeResult | "loading" | "error";

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(",")[1];
            resolve(base64 ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function StudioPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [targetNames, setTargetNames] = useState("");
    const [context, setContext] = useState("");
    const [optionalDate, setOptionalDate] = useState("");
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [referencePreview, setReferencePreview] = useState<string | null>(null);
    const [results, setResults] = useState<Record<StudioTone, ResultState>>({
        roast: "error",
        funny: "error",
        sweet: "error",
        bold: "error",
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace("/");
            return;
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!referenceFile) {
            setReferencePreview(null);
            return;
        }
        const url = URL.createObjectURL(referenceFile);
        setReferencePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [referenceFile]);

    const fetchOneTone = useCallback(
        async (tone: StudioTone, referenceBase64?: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-generator`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    target_names: targetNames.trim(),
                    context_description: context.trim(),
                    tone,
                    optional_date: optionalDate.trim() || undefined,
                    reference_image_base64: referenceBase64,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Request failed");
            return data as MemeResult;
        },
        [targetNames, context, optionalDate]
    );

    const handleGenerate = useCallback(async () => {
        if (!user || !targetNames.trim() || !context.trim()) return;
        setIsGenerating(true);
        setHasGenerated(true);
        const referenceBase64 = referenceFile ? await fileToBase64(referenceFile) : undefined;
        setResults({ roast: "loading", funny: "loading", sweet: "loading", bold: "loading" });

        await Promise.allSettled(
            TONES.map(async (tone) => {
                try {
                    const data = await fetchOneTone(tone, referenceBase64);
                    setResults((prev) => ({ ...prev, [tone]: data }));
                } catch {
                    setResults((prev) => ({ ...prev, [tone]: "error" }));
                }
            })
        );
        setIsGenerating(false);
    }, [user, targetNames, context, referenceFile, fetchOneTone]);

    const handleRegenerate = useCallback(
        async (tone: StudioTone) => {
            if (!user) return;
            setResults((prev) => ({ ...prev, [tone]: "loading" }));
            const referenceBase64 = referenceFile ? await fileToBase64(referenceFile) : undefined;
            try {
                const data = await fetchOneTone(tone, referenceBase64);
                setResults((prev) => ({ ...prev, [tone]: data }));
            } catch {
                setResults((prev) => ({ ...prev, [tone]: "error" }));
            }
        },
        [user, referenceFile, fetchOneTone]
    );

    const handleDownload = useCallback(
        async (imageUrl: string, names: string, caption: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                alert("Please sign in to download.");
                return;
            }
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/library-bind`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    image_url: imageUrl,
                    names: names.trim() || null,
                    caption: caption.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_base64) throw new Error(data.error ?? "Download failed");
            const a = document.createElement("a");
            a.href = `data:image/jpeg;base64,${data.image_base64}`;
            a.download = `meme-supreme-${Date.now()}.jpg`;
            a.click();
        },
        []
    );

    const handleCaptionChange = useCallback((tone: StudioTone, caption: string) => {
        setResults((prev) => {
            const current = prev[tone];
            if (current === "loading" || current === "error") return prev;
            return { ...prev, [tone]: { ...current, caption } };
        });
    }, []);

    const handleNamesChange = useCallback((tone: StudioTone, names: string) => {
        setResults((prev) => {
            const current = prev[tone];
            if (current === "loading" || current === "error") return prev;
            return { ...prev, [tone]: { ...current, names } };
        });
    }, []);

    if (authLoading || !user) {
        return (
            <div className={styles.wrap}>
                <div className={styles.loading}>Loading…</div>
            </div>
        );
    }

    return (
        <div className={styles.wrap}>
            <header className={styles.header}>
                <h1 className={styles.title}>
                    Meme <span className="text-gradient">Studio</span>
                </h1>
                <p className={styles.subtitle}>
                    Generate all four tones at once. Edit text, add a reference image, regenerate any card, then download.
                </p>
            </header>

            <section className={styles.formSection}>
                <div className={styles.formGrid}>
                    <div className={styles.field}>
                        <label htmlFor="studio-names">Names</label>
                        <input
                            id="studio-names"
                            type="text"
                            value={targetNames}
                            onChange={(e) => setTargetNames(e.target.value)}
                            placeholder="e.g. Alex, Sam"
                            className={styles.input}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="studio-date">Optional date (e.g. for astrology)</label>
                        <input
                            id="studio-date"
                            type="text"
                            value={optionalDate}
                            onChange={(e) => setOptionalDate(e.target.value)}
                            placeholder="Name: YYYY-MM-DD"
                            className={styles.input}
                        />
                    </div>
                </div>
                <div className={styles.field}>
                    <label htmlFor="studio-context">Context / description</label>
                    <textarea
                        id="studio-context"
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="What’s the situation or vibe for the meme?"
                        className={styles.textarea}
                        rows={3}
                    />
                </div>
                <div className={styles.field}>
                    <label>Reference image (product, logo, place — optional)</label>
                    <div className={styles.referenceRow}>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                            className={styles.fileInput}
                        />
                        {referencePreview && (
                            <div className={styles.referencePreview}>
                                <img src={referencePreview} alt="Reference" />
                            </div>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    className={styles.generateBtn}
                    onClick={handleGenerate}
                    disabled={isGenerating || !targetNames.trim() || !context.trim()}
                >
                    {isGenerating ? "Generating…" : "Generate all 4 tones"}
                </button>
            </section>

            {hasGenerated && (
                <section className={styles.resultsSection}>
                    <h2 className={styles.resultsTitle}>Results</h2>
                    <div className={styles.grid}>
                        {TONES.map((tone) => {
                            const state = results[tone];
                            if (state === "loading") {
                                return (
                                    <StudioMemeCard
                                        key={tone}
                                        meme_id=""
                                        image_url=""
                                        caption=""
                                        names=""
                                        tone={tone}
                                        onRegenerate={() => handleRegenerate(tone)}
                                        onDownload={handleDownload}
                                        loading
                                    />
                                );
                            }
                            if (state === "error") {
                                return (
                                    <div key={tone} className={styles.errorCard}>
                                        <span className={styles.toneLabel}>{tone}</span>
                                        <p>Failed to generate. Try again.</p>
                                        <button
                                            type="button"
                                            className={styles.retryBtn}
                                            onClick={() => handleRegenerate(tone)}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <StudioMemeCard
                                    key={state.meme_id}
                                    meme_id={state.meme_id}
                                    image_url={state.image_url}
                                    caption={state.caption}
                                    names={state.names}
                                    tone={tone}
                                    onRegenerate={() => handleRegenerate(tone)}
                                    onCaptionChange={(caption) => handleCaptionChange(tone, caption)}
                                    onNamesChange={(names) => handleNamesChange(tone, names)}
                                    onDownload={handleDownload}
                                />
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
}
