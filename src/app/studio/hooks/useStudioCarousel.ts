import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { CarouselFormat, CarouselResult } from "../types";
import { StudioTone } from "@/components/StudioMemeCard";

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

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
    const [refPreview, setRefPreview] = useState<string | null>(null);
    const [refImage, setRefImage] = useState<File | null>(null);

    const addRefImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file?.type.startsWith("image/")) return;
        setRefImage(file);
        setRefPreview(URL.createObjectURL(file));
        e.target.value = "";
    }, []);

    const removeRefImage = useCallback(() => {
        if (refPreview) URL.revokeObjectURL(refPreview);
        setRefImage(null);
        setRefPreview(null);
    }, [refPreview]);

    const handleCreateCarousel = useCallback(async (isSubscribed: boolean, imagesUsed: number, imagesLimit: number) => {
        if (!user || !isSubscribed) return;
        if (imagesUsed + 6 > imagesLimit) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        setCarouselError(null);
        setCarouselResult(null);
        setCarouselGenerating(true);
        try {
            const reference_image_base64 = refImage ? await fileToBase64(refImage) : undefined;
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
                    reference_image_base64,
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
    }, [user, carouselFormat, carouselTone, context, refImage, fetchHistory]);

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
        handleDownloadSlide,
        refPreview,
        addRefImage,
        removeRefImage,
    };
}
