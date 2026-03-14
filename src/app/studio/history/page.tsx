"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import StudioMemeCard, { type StudioTone, type TextStyle } from "@/components/StudioMemeCard";
import ReelResult from "@/components/ReelResult";
import styles from "./page.module.css";

interface HistoryItem {
    id: string;
    image_url: string;
    caption: string;
    names: string | null;
    tone: StudioTone;
    target_names: string | null;
    context_description: string | null;
    created_at: string;
    text_style?: { font?: string; size?: string; allCaps?: boolean } | null;
}

interface VideoItem {
    id: string;
    video_url: string;
    description: string | null;
    goal: string | null;
    created_at: string;
}

type HistoryTab = "images" | "reels";

export default function StudioHistoryPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [tab, setTab] = useState<HistoryTab>("images");
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [fetching, setFetching] = useState(true);
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace("/"); return; }
    }, [user, authLoading, router]);

    const fetchAll = useCallback(async () => {
        if (!user) return;
        setFetching(true);
        const [memesRes, videosRes] = await Promise.all([
            supabase
                .from("studio_memes")
                .select("id, image_url, caption, names, tone, target_names, context_description, created_at, text_style")
                .order("created_at", { ascending: false }),
            supabase
                .from("studio_videos")
                .select("id, video_url, description, goal, created_at")
                .order("created_at", { ascending: false }),
        ]);
        setItems((memesRes.data ?? []) as HistoryItem[]);
        setVideos((videosRes.data ?? []) as VideoItem[]);
        setFetching(false);
    }, [user]);

    useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

    const patchItem = useCallback((id: string, patch: Partial<HistoryItem>) => {
        setItems((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    }, []);

    const persistImage = useCallback(async (memeId: string, newImageUrl: string) => {
        await supabase
            .from("studio_memes")
            .update({ image_url: newImageUrl, updated_at: new Date().toISOString() })
            .eq("id", memeId);
    }, []);

    const handleDownload = useCallback(
        async (imageUrl: string, names: string, caption: string, textStyle: TextStyle) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { alert("Please sign in to download."); return; }
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/library-bind`;
            const res = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_url: imageUrl,
                    names: names.trim() || null,
                    caption: caption.trim(),
                    text_style: { font: textStyle.font, size: textStyle.size, allCaps: textStyle.allCaps },
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

    const handleSaveTextStyle = useCallback(
        async (memeId: string, textStyle: TextStyle) => {
            await supabase
                .from("studio_memes")
                .update({ text_style: { font: textStyle.font, size: textStyle.size, allCaps: textStyle.allCaps }, updated_at: new Date().toISOString() })
                .eq("id", memeId);
            patchItem(memeId, { text_style: { font: textStyle.font, size: textStyle.size, allCaps: textStyle.allCaps } });
        },
        [patchItem]
    );

    const handleEditImage = useCallback(
        async (item: HistoryItem, instruction: string, productBase64?: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-image-edit`;
            const res = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    image_url: item.image_url,
                    edit_instruction: instruction || undefined,
                    product_image_base64: productBase64,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_url) throw new Error(data.error ?? "Image edit failed");
            patchItem(item.id, { image_url: data.image_url });
            await persistImage(item.id, data.image_url);
        },
        [patchItem, persistImage]
    );

    const handleRegenerate = useCallback(
        async (item: HistoryItem) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;
            setLoadingIds((prev) => new Set(prev).add(item.id));
            try {
                const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-generator`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        target_names: item.target_names ?? "",
                        context_description: item.context_description ?? "",
                        tone: item.tone,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.image_url) {
                    patchItem(item.id, { image_url: data.image_url, caption: data.caption, names: data.names ?? item.names });
                }
            } finally {
                setLoadingIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
            }
        },
        [patchItem]
    );

    const handleDeleteVideo = useCallback(async (videoId: string) => {
        await supabase.from("studio_videos").delete().eq("id", videoId);
        setVideos((prev) => prev.filter((v) => v.id !== videoId));
    }, []);

    if (authLoading || !user) {
        return <div className={styles.wrap}><div className={styles.loading}>Loading…</div></div>;
    }

    const totalCount = tab === "images" ? items.length : videos.length;

    return (
        <div className={styles.wrap}>
            <header className={styles.header}>
                <div className={styles.headerTop}>
                    <Link href="/studio" className={styles.backBtn}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 5l-7 7 7 7" />
                        </svg>
                        Studio
                    </Link>
                    <span className={styles.countBadge}>{totalCount > 0 ? `${totalCount} ${tab}` : ""}</span>
                </div>
                <h1 className={styles.title}>My <span className="text-gradient">Content</span></h1>
                <p className={styles.subtitle}>All your generated memes and reels — edit, download, or share.</p>

                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === "images" ? styles.tabBtnActive : ""}`}
                        onClick={() => setTab("images")}
                    >
                        Images
                        {items.length > 0 && <span className={styles.tabCount}>{items.length}</span>}
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === "reels" ? styles.tabBtnActive : ""}`}
                        onClick={() => setTab("reels")}
                    >
                        Reels
                        {videos.length > 0 && <span className={styles.tabCount}>{videos.length}</span>}
                    </button>
                </div>
            </header>

            {fetching ? (
                <div className={styles.loading}>Loading…</div>
            ) : tab === "images" ? (
                items.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No images yet. Head to the Studio to generate your first meme.</p>
                        <Link href="/studio" className={styles.emptyBtn}>Go to Studio</Link>
                    </div>
                ) : (
                    <section className={styles.gridSection}>
                        <div className={styles.grid}>
                            {items.map((item) => (
                                <StudioMemeCard
                                    key={item.id}
                                    meme_id={item.id}
                                    image_url={item.image_url}
                                    caption={item.caption}
                                    names={item.names}
                                    tone={item.tone}
                                    initialTextStyle={item.text_style ?? undefined}
                                    loading={loadingIds.has(item.id)}
                                    onRegenerate={() => handleRegenerate(item)}
                                    onDownload={handleDownload}
                                    onSaveTextStyle={handleSaveTextStyle}
                                    onEditImage={(instruction, productBase64) => handleEditImage(item, instruction, productBase64)}
                                />
                            ))}
                        </div>
                    </section>
                )
            ) : (
                videos.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No reels yet. Head to the Studio Reels tab to generate your first reel.</p>
                        <Link href="/studio" className={styles.emptyBtn}>Go to Studio</Link>
                    </div>
                ) : (
                    <section className={styles.gridSection}>
                        <div className={styles.reelsGrid}>
                            {videos.map((video) => (
                                <div key={video.id} className={styles.reelItem}>
                                    <ReelResult videoUrl={video.video_url} />
                                    <div className={styles.reelMeta}>
                                        {video.description && (
                                            <p className={styles.reelDesc}>{video.description}</p>
                                        )}
                                        {video.goal && (
                                            <span className={styles.reelGoalBadge}>{video.goal.replace(/_/g, " ")}</span>
                                        )}
                                        <button
                                            type="button"
                                            className={styles.deleteBtn}
                                            onClick={() => handleDeleteVideo(video.id)}
                                            title="Delete reel"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6l-1 14H6L5 6" />
                                                <path d="M10 11v6M14 11v6" />
                                                <path d="M9 6V4h6v2" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )
            )}
        </div>
    );
}
