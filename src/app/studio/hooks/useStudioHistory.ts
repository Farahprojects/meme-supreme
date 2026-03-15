import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { HistoryItem, MemeResult } from "../types";
import { StudioTone, TextStyle } from "@/components/StudioMemeCard";

// Preserve the overall newest-first order but ensure slides within each
// carousel are in slide_index ascending order (slide 1 first, not last).
function sortCarouselSlides(items: HistoryItem[]): HistoryItem[] {
    const processed = new Set<string>();
    const result: HistoryItem[] = [];
    for (const item of items) {
        if (item.carousel_id) {
            if (processed.has(item.carousel_id)) continue;
            const group = items
                .filter((i) => i.carousel_id === item.carousel_id)
                .sort((a, b) => (a.slide_index ?? 0) - (b.slide_index ?? 0));
            result.push(...group);
            processed.add(item.carousel_id);
        } else {
            result.push(item);
        }
    }
    return result;
}

export function useStudioHistory(user: User | null) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyFetching, setHistoryFetching] = useState(false);
    const [historyLoadingIds, setHistoryLoadingIds] = useState<Set<string>>(new Set());
    const [showAllHistory, setShowAllHistory] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!user) return;
        setHistoryFetching(true);
        const { data } = await supabase
            .from("studio_memes")
            .select("id, image_url, caption, names, tone, target_names, context_description, created_at, carousel_id, slide_index, text_style")
            .order("created_at", { ascending: false })
            .limit(60);
        setHistory(sortCarouselSlides((data ?? []) as HistoryItem[]));
        setHistoryFetching(false);
    }, [user]);

    useEffect(() => {
        if (user) fetchHistory();
    }, [user, fetchHistory]);

    const patchHistoryItem = useCallback((id: string, patch: Partial<HistoryItem>) => {
        setHistory((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    }, []);

    const persistEditedImage = useCallback(async (memeId: string, newImageUrl: string) => {
        await supabase
            .from("studio_memes")
            .update({ image_url: newImageUrl, updated_at: new Date().toISOString() })
            .eq("id", memeId);
    }, []);

    const handleDownload = useCallback(
        async (imageUrl: string, names: string, caption: string, textStyle: TextStyle) => {
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
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
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
                .update({
                    text_style: { font: textStyle.font, size: textStyle.size, allCaps: textStyle.allCaps },
                    updated_at: new Date().toISOString(),
                })
                .eq("id", memeId);
            patchHistoryItem(memeId, { text_style: { font: textStyle.font, size: textStyle.size, allCaps: textStyle.allCaps } });
        },
        [patchHistoryItem]
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
                        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
        async (item: HistoryItem, instruction: string, productBase64?: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-image-edit`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    image_url: item.image_url,
                    edit_instruction: instruction || undefined,
                    product_image_base64: productBase64,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_url) throw new Error(data.error ?? "Image edit failed");
            patchHistoryItem(item.id, { image_url: data.image_url });
            await persistEditedImage(item.id, data.image_url);
        },
        [patchHistoryItem, persistEditedImage]
    );

    return {
        history,
        historyFetching,
        historyLoadingIds,
        showAllHistory,
        setShowAllHistory,
        fetchHistory,
        handleDownload,
        handleSaveTextStyle,
        handleHistoryRegenerate,
        handleHistoryEditImage,
        persistEditedImage
    };
}
