import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { CarouselFormat, CarouselResult } from "../types";
import { StudioTone } from "@/components/StudioMemeCard";

export function useStudioCarousel(
    user: User | null,
    context: string,
    fetchHistory: () => void
) {
    const [carouselFormat, setCarouselFormat] = useState<CarouselFormat>("teach");
    const [carouselTone, setCarouselTone] = useState<StudioTone>("funny");
    const [carouselResult, setCarouselResult] = useState<CarouselResult | null>(null);
    const [carouselGenerating, setCarouselGenerating] = useState(false);
    const [carouselError, setCarouselError] = useState<string | null>(null);

    const handleCreateCarousel = useCallback(async (isSubscribed: boolean, imagesUsed: number, imagesLimit: number) => {
        if (!user || !isSubscribed) return;
        if (imagesUsed + 6 > imagesLimit) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        setCarouselError(null);
        setCarouselResult(null);
        setCarouselGenerating(true);
        try {
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-carousel-generate`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    format: carouselFormat,
                    context_description: context.trim(),
                    tone: carouselTone,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setCarouselError(data.error ?? "Failed to create carousel");
                return;
            }
            setCarouselResult({ carousel_id: data.carousel_id, slides: data.slides ?? [] });
            fetchHistory();
        } catch (e) {
            setCarouselError(e instanceof Error ? e.message : "Failed to create carousel");
        } finally {
            setCarouselGenerating(false);
        }
    }, [user, carouselFormat, carouselTone, context, fetchHistory]);

    const handleDownloadSlide = useCallback(async (imageUrl: string, filename: string) => {
        try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            window.open(imageUrl, "_blank");
        }
    }, []);

    return {
        carouselFormat, setCarouselFormat,
        carouselTone, setCarouselTone,
        carouselResult,
        carouselGenerating,
        carouselError,
        handleCreateCarousel,
        handleDownloadSlide
    };
}
