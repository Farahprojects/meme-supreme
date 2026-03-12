"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import StudioMemeCard, { type StudioTone } from "@/components/StudioMemeCard";
import styles from "./page.module.css";

const TONES: StudioTone[] = ["roast", "funny", "sweet", "bold"];
const HISTORY_DEFAULT_SHOW = 4;

export interface MemeResult {
    meme_id: string;
    image_url: string;
    caption: string;
    tone: string;
    names?: string | null;
}

type ResultState = MemeResult | "loading" | "error";

interface HistoryItem {
    id: string;
    image_url: string;
    caption: string;
    names: string | null;
    tone: StudioTone;
    target_names: string | null;
    context_description: string | null;
    created_at: string;
}

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
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyFetching, setHistoryFetching] = useState(false);
    const [historyLoadingIds, setHistoryLoadingIds] = useState<Set<string>>(new Set());
    const [showAllHistory, setShowAllHistory] = useState(false);

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

    const fetchHistory = useCallback(async () => {
        if (!user) return;
        setHistoryFetching(true);
        const { data } = await supabase
            .from("studio_memes")
            .select("id, image_url, caption, names, tone, target_names, context_description, created_at")
            .order("created_at", { ascending: false })
            .limit(60);
        setHistory((data ?? []) as HistoryItem[]);
        setHistoryFetching(false);
    }, [user]);

    useEffect(() => {
        if (user) fetchHistory();
    }, [user, fetchHistory]);

    const patchHistoryItem = useCallback((id: string, patch: Partial<HistoryItem>) => {
        setHistory((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    }, []);

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
        fetchHistory();
    }, [user, targetNames, context, referenceFile, fetchOneTone, fetchHistory]);

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

    const handleEditImage = useCallback(
        async (tone: StudioTone, instruction: string) => {
            const current = results[tone];
            if (current === "loading" || current === "error") return;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");

            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-image-edit`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    image_url: current.image_url,
                    edit_instruction: instruction,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_url) throw new Error(data.error ?? "Image edit failed");

            setResults((prev) => {
                const c = prev[tone];
                if (c === "loading" || c === "error") return prev;
                return { ...prev, [tone]: { ...c, image_url: data.image_url } };
            });
        },
        [results]
    );

    const handleHistoryRegenerate = useCallback(
        async (item: HistoryItem) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;
            setHistoryLoadingIds((prev) => new Set(prev).add(item.id));
            try {
                const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-generator`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        target_names: item.target_names ?? "",
                        context_description: item.context_description ?? "",
                        tone: item.tone,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.image_url) {
                    patchHistoryItem(item.id, {
                        image_url: data.image_url,
                        caption: data.caption,
                        names: data.names ?? item.names,
                    });
                }
            } finally {
                setHistoryLoadingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                });
            }
        },
        [patchHistoryItem]
    );

    const handleHistoryEditImage = useCallback(
        async (item: HistoryItem, instruction: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-image-edit`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ image_url: item.image_url, edit_instruction: instruction }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_url) throw new Error(data.error ?? "Image edit failed");
            patchHistoryItem(item.id, { image_url: data.image_url });
        },
        [patchHistoryItem]
    );

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
                        <label htmlFor="studio-names">Name / Heading</label>
                        <input
                            id="studio-names"
                            type="text"
                            value={targetNames}
                            onChange={(e) => setTargetNames(e.target.value)}
                            placeholder="e.g. Alex, Sam"
                            className={styles.input}
                        />
                    </div>
                    {/* Date/astrology field hidden — re-enable when ready */}
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
                        <label className={styles.fileLabel}>
                            + Image
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                                className={styles.fileInputHidden}
                            />
                        </label>
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
                                    onEditImage={(instruction) => handleEditImage(tone, instruction)}
                                />
                            );
                        })}
                    </div>
                </section>
            )}

            {(history.length > 0 || historyFetching) && (
                <section className={styles.historySection}>
                    <div className={styles.historyHeader}>
                        <h2 className={styles.resultsTitle}>
                            History
                            {history.length > 0 && (
                                <span className={styles.historyCount}>{history.length}</span>
                            )}
                        </h2>
                        {history.length > HISTORY_DEFAULT_SHOW && (
                            <button
                                type="button"
                                className={styles.showAllBtn}
                                onClick={() => setShowAllHistory((v) => !v)}
                            >
                                {showAllHistory ? "Show less" : `Show all ${history.length}`}
                            </button>
                        )}
                    </div>

                    {historyFetching && history.length === 0 ? (
                        <p className={styles.historyEmpty}>Loading history…</p>
                    ) : (
                        <div className={styles.grid}>
                            {(showAllHistory ? history : history.slice(0, HISTORY_DEFAULT_SHOW)).map((item) => (
                                <StudioMemeCard
                                    key={item.id}
                                    meme_id={item.id}
                                    image_url={item.image_url}
                                    caption={item.caption}
                                    names={item.names}
                                    tone={item.tone}
                                    loading={historyLoadingIds.has(item.id)}
                                    onRegenerate={() => handleHistoryRegenerate(item)}
                                    onDownload={handleDownload}
                                    onEditImage={(instruction) => handleHistoryEditImage(item, instruction)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
