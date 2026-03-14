import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { StudioTone } from "@/components/StudioMemeCard";
import { MemeResult, ResultState } from "../types";

export function useStudioImages(
    user: User | null,
    targetNames: string,
    context: string,
    optionalDate: string,
    selectedTones: Set<StudioTone>,
    setIsGenerating: (v: boolean) => void,
    setHasGenerated: (v: boolean) => void,
    fetchHistory: () => void,
    persistEditedImage: (memeId: string, newImageUrl: string) => Promise<void>
) {
    const [results, setResults] = useState<Record<StudioTone, ResultState>>({
        roast: "error",
        funny: "error",
        sweet: "error",
        bold: "error",
    });

    const fetchOneTone = useCallback(
        async (tone: StudioTone) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Not signed in");
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-generator`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    target_names: targetNames.trim(),
                    context_description: context.trim(),
                    tone,
                    optional_date: optionalDate.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Request failed");
            return data as MemeResult;
        },
        [targetNames, context, optionalDate]
    );

    const handleGenerate = useCallback(async (isSubscribed: boolean, imagesUsed: number, imagesLimit: number) => {
        if (!user || !targetNames.trim() || !context.trim()) return;
        if (!isSubscribed) return;
        if (imagesUsed >= imagesLimit) return;
        
        const toGenerate = Array.from(selectedTones);
        setIsGenerating(true);
        setHasGenerated(true);
        
        setResults({ roast: "error", funny: "error", sweet: "error", bold: "error" });
        setResults((prev) => {
            const next = { ...prev };
            toGenerate.forEach((t) => { next[t] = "loading"; });
            return next;
        });

        await Promise.allSettled(
            toGenerate.map(async (tone) => {
                try {
                    const data = await fetchOneTone(tone);
                    setResults((prev) => ({ ...prev, [tone]: data }));
                } catch {
                    setResults((prev) => ({ ...prev, [tone]: "error" }));
                }
            })
        );
        setIsGenerating(false);
        fetchHistory();
    }, [user, targetNames, context, selectedTones, fetchOneTone, fetchHistory, setIsGenerating, setHasGenerated]);

    const handleRegenerate = useCallback(
        async (tone: StudioTone) => {
            if (!user) return;
            setResults((prev) => ({ ...prev, [tone]: "loading" }));
            try {
                const data = await fetchOneTone(tone);
                setResults((prev) => ({ ...prev, [tone]: data }));
            } catch {
                setResults((prev) => ({ ...prev, [tone]: "error" }));
            }
        },
        [user, fetchOneTone]
    );

    const handleEditImage = useCallback(
        async (tone: StudioTone, instruction: string, productBase64?: string) => {
            const current = results[tone];
            if (current === "loading" || current === "error") return;

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
                    image_url: current.image_url,
                    edit_instruction: instruction || undefined,
                    product_image_base64: productBase64,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.image_url) throw new Error(data.error ?? "Image edit failed");

            setResults((prev) => {
                const c = prev[tone];
                if (c === "loading" || c === "error") return prev;
                return { ...prev, [tone]: { ...c, image_url: data.image_url } };
            });

            await persistEditedImage(current.meme_id, data.image_url);
        },
        [results, persistEditedImage]
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

    return {
        results,
        handleGenerate,
        handleRegenerate,
        handleEditImage,
        handleCaptionChange,
        handleNamesChange
    };
}
