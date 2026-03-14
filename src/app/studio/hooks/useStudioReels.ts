import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { ReelGoal, ReelLength, ReelScript, ReelStatus, ReelScriptStatus } from "../types";
import { REELS_POLL_INTERVAL_MS, MAX_REEL_REF_IMAGES } from "../constants";

export function useStudioReels(
    user: User | null,
    context: string
) {
    const [reelRefImages, setReelRefImages] = useState<File[]>([]);
    const [reelRefPreviews, setReelRefPreviews] = useState<string[]>([]);
    const [reelGoal, setReelGoal] = useState<ReelGoal>("engagement");
    const [reelLength, setReelLength] = useState<ReelLength>("continuous");
    const [reelScript, setReelScript] = useState<ReelScript | null>(null);
    const [reelScriptStatus, setReelScriptStatus] = useState<ReelScriptStatus>("idle");
    
    /** 0 = generating scene 1, 1 = extending to scene 2, etc. null = idle/done */
    const [reelPhase, setReelPhase] = useState<number | null>(null);
    const [reelOperationName, setReelOperationName] = useState<string | null>(null);
    const [reelStatus, setReelStatus] = useState<ReelStatus>("idle");
    const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);
    const [reelError, setReelError] = useState<string | null>(null);
    const reelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fileToBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(",")[1];
                resolve(base64 ?? "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const handleWriteScript = useCallback(async () => {
        if (!user || !context.trim()) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        
        setReelError(null);
        setReelScriptStatus("writing");
        try {
            const reference_images_base64 =
                reelRefImages.length > 0
                    ? await Promise.all(reelRefImages.slice(0, MAX_REEL_REF_IMAGES).map(fileToBase64))
                    : undefined;
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-reels-script`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    description: context.trim(),
                    goal: reelGoal,
                    num_scenes: reelLength === "single" ? 1 : 2,
                    reference_images_base64,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setReelScriptStatus("idle");
                setReelError(data.error ?? "Failed to write script");
                return;
            }
            setReelScript({
                scenes: Array.isArray(data.scenes) ? data.scenes : [],
                rationale: data.rationale ?? "",
            });
            setReelScriptStatus("ready");
        } catch (e) {
            setReelScriptStatus("idle");
            setReelError(e instanceof Error ? e.message : "Failed to write script");
        }
    }, [user, context, reelGoal, reelLength, reelRefImages]);

    const handleCreateReel = useCallback(async (isSubscribed: boolean, reelsUsed: number, reelsLimit: number) => {
        if (!user || !isSubscribed) return;
        if (reelsUsed >= reelsLimit) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        setReelError(null);
        setReelStatus("generating");
        setReelVideoUrl(null);
        
        const hasScript = reelScript?.scenes?.length && (reelScript.scenes[0]?.trim() ?? "") !== "";
        if (!hasScript) {
            setReelStatus("idle");
            setReelError("Please write a script before generating.");
            return;
        }
        setReelPhase(0);
        try {
            const reference_images_base64 =
                reelRefImages.length > 0
                    ? await Promise.all(reelRefImages.slice(0, MAX_REEL_REF_IMAGES).map(fileToBase64))
                    : undefined;
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-reels-generate`;
            const body = { prompt: reelScript!.scenes[0].trim(), reference_images_base64 };
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setReelStatus("error");
                setReelPhase(null);
                setReelError(data.error ?? "Failed to start reel");
                return;
            }
            const opName = data.operation_name;
            if (!opName) {
                setReelStatus("error");
                setReelPhase(null);
                setReelError("No operation ID returned");
                return;
            }
            setReelOperationName(opName);
        } catch (e) {
            setReelStatus("error");
            setReelPhase(null);
            setReelError(e instanceof Error ? e.message : "Failed to start reel");
        }
    }, [user, reelRefImages, reelScript]);

    const pollReelStatus = useCallback(async () => {
        if (!reelOperationName) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-reels-status`;
        const currentPhase = reelPhase;
        const totalScenes = reelScript?.scenes?.length ?? 1;
        const isLastSegment = currentPhase === null || currentPhase >= totalScenes - 1;
        
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                operation_name: reelOperationName,
                description: context.trim() || undefined,
                goal: reelGoal,
                is_final: isLastSegment,
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            setReelStatus("error");
            setReelError(data.error ?? "Status check failed");
            if (reelPollRef.current) {
                clearInterval(reelPollRef.current);
                reelPollRef.current = null;
            }
            return;
        }
        if (data.done) {
            if (reelPollRef.current) {
                clearInterval(reelPollRef.current);
                reelPollRef.current = null;
            }
            if (data.error) {
                setReelStatus("error");
                setReelError(data.error);
                setReelPhase(null);
                return;
            }
            if (data.video_url) {
                const nextSceneIndex = reelPhase !== null ? reelPhase + 1 : 0;
                const nextPrompt = reelScript?.scenes?.[nextSceneIndex]?.trim();
                const hasMoreScenes = reelScript?.scenes && nextSceneIndex < reelScript.scenes.length && nextPrompt;
                
                if (reelPhase !== null && hasMoreScenes) {
                    try {
                        const extendUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-reels-extend`;
                        const extendRes = await fetch(extendUrl, {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${session.access_token}`,
                                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ video_gcs_uri: data.video_uri, video_url: data.video_url, prompt: nextPrompt }),
                        });
                        const extendData = await extendRes.json();
                        if (!extendRes.ok || !extendData.operation_name) {
                            setReelStatus("error");
                            setReelError(extendData.error ?? "Failed to start extension");
                            setReelPhase(null);
                            return;
                        }
                        setReelOperationName(extendData.operation_name);
                        setReelPhase(nextSceneIndex);
                    } catch (e) {
                        setReelStatus("error");
                        setReelError(e instanceof Error ? e.message : "Extension failed");
                        setReelPhase(null);
                    }
                    return;
                }
                setReelVideoUrl(data.video_url);
                setReelStatus("done");
                setReelPhase(null);
            } else {
                setReelStatus("error");
                setReelError("No video URL in response");
                setReelPhase(null);
            }
        }
    }, [reelOperationName, reelPhase, reelScript, context, reelGoal]);

    useEffect(() => {
        if (reelStatus !== "generating" || !reelOperationName) return;
        const tick = () => pollReelStatus();
        tick();
        reelPollRef.current = setInterval(tick, REELS_POLL_INTERVAL_MS);
        return () => {
            if (reelPollRef.current) {
                clearInterval(reelPollRef.current);
                reelPollRef.current = null;
            }
        };
    }, [reelStatus, reelOperationName, pollReelStatus]);

    useEffect(() => {
        const urls = reelRefImages.map((f) => URL.createObjectURL(f));
        setReelRefPreviews(urls);
        return () => urls.forEach((u) => URL.revokeObjectURL(u));
    }, [reelRefImages]);

    const addReelRefImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        if (!file) return;
        setReelRefImages((prev) => [...prev, file].slice(0, MAX_REEL_REF_IMAGES));
        e.target.value = "";
    }, []);

    const removeReelRefImage = useCallback((index: number) => {
        setReelRefImages((prev) => prev.filter((_, i) => i !== index));
    }, []);

    return {
        reelRefImages, setReelRefImages,
        reelRefPreviews,
        reelGoal, setReelGoal,
        reelLength, setReelLength,
        reelScript, setReelScript,
        reelScriptStatus, setReelScriptStatus,
        reelPhase,
        reelStatus,
        reelVideoUrl,
        reelError,
        handleWriteScript,
        handleCreateReel,
        addReelRefImage,
        removeReelRefImage
    };
}
