"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase";
import SceneCard, { type Scene, type SceneType, type AssetType } from "@/components/SceneCard";
import VideoSequencePlayer from "@/components/VideoSequencePlayer";
import styles from "./page.module.css";

const POLL_INTERVAL_MS = 3000;

function makeScene(order: number, overrides: Partial<Scene> = {}): Scene {
    return {
        id: crypto.randomUUID(),
        order,
        type: "video",
        source: "ai",
        aspect_ratio: "9:16",
        duration: 6,
        status: "empty",
        ...overrides,
    };
}

function reorder(scenes: Scene[]): Scene[] {
    return scenes.map((s, i) => ({ ...s, order: i }));
}

export default function EditorPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const subscription = useSubscription();

    const [scenes, setScenes] = useState<Scene[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [playerOpen, setPlayerOpen] = useState(false);
    const [ideaPrompt, setIdeaPrompt] = useState("");
    const [ideaLoading, setIdeaLoading] = useState(false);
    const [ideaError, setIdeaError] = useState<string | null>(null);

    // Per-scene polling intervals: sceneId → interval id
    const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    // Clear all polls on unmount
    useEffect(() => {
        const refs = pollRefs.current;
        return () => {
            Object.values(refs).forEach(clearInterval);
        };
    }, []);

    // Load draft from localStorage on mount
    useEffect(() => {
        try {
            const draft = localStorage.getItem("meme_supreme_editor_draft");
            if (draft) {
                const parsed = JSON.parse(draft);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setScenes(parsed);
                }
            }
        } catch (e) {
            console.error("Failed to load editor draft", e);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Save draft to localStorage whenever scenes change (only after initial load)
    useEffect(() => {
        if (!isLoaded) return;
        localStorage.setItem("meme_supreme_editor_draft", JSON.stringify(scenes));
    }, [scenes, isLoaded]);

    const handleClearDraft = () => {
        if (confirm("Are you sure you want to start over? This will clear your entire timeline.")) {
            localStorage.removeItem("meme_supreme_editor_draft");
            setScenes([]);
        }
    };

    const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
    const readyCount = scenes.filter((s) => s.status === "ready").length;
    const allReady = scenes.length > 0 && readyCount === scenes.length;

    // ── Scene mutations ────────────────────────────────────────────────────────

    const updateScene = useCallback((id: string, patch: Partial<Scene>) => {
        setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }, []);

    const addScene = useCallback(() => {
        setScenes((prev) => {
            const order = prev.length;
            return [...prev, makeScene(order)];
        });
    }, []);

    const insertSceneAfter = useCallback((id: string) => {
        setScenes((prev) => {
            const idx = prev.findIndex((s) => s.id === id);
            if (idx === -1) return prev;
            const next = [
                ...prev.slice(0, idx + 1),
                makeScene(idx + 1),
                ...prev.slice(idx + 1),
            ];
            return reorder(next);
        });
    }, []);

    const moveScene = useCallback((fromIndex: number, toIndex: number) => {
        setScenes((prev) => {
            const sorted = [...prev].sort((a, b) => a.order - b.order);
            const item = sorted[fromIndex];
            const remaining = sorted.filter((_, i) => i !== fromIndex);
            const next = [
                ...remaining.slice(0, toIndex),
                item,
                ...remaining.slice(toIndex),
            ];
            return reorder(next);
        });
    }, []);

    const deleteScene = useCallback((id: string) => {
        if (pollRefs.current[id]) {
            clearInterval(pollRefs.current[id]);
            delete pollRefs.current[id];
        }
        setScenes((prev) => reorder(prev.filter((s) => s.id !== id)));
    }, []);

    // ── Auth helpers ───────────────────────────────────────────────────────────

    const getSession = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    }, []);

    const authHeaders = useCallback(async () => {
        const session = await getSession();
        if (!session?.access_token) return null;
        return {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            "Content-Type": "application/json",
        };
    }, [getSession]);

    const fnUrl = (name: string) =>
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;

    // ── Generate From Idea ─────────────────────────────────────────────────────

    const handleGenerateFromIdea = useCallback(async () => {
        const trimmed = ideaPrompt.trim();
        if (!trimmed || ideaLoading) return;
        const headers = await authHeaders();
        if (!headers) return;

        setIdeaLoading(true);
        setIdeaError(null);

        try {
            const res = await fetch(fnUrl("studio-reels-script"), {
                method: "POST",
                headers,
                body: JSON.stringify({
                    description: trimmed,
                    goal: "engagement",
                    num_scenes: 3,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setIdeaError(data.error ?? "Failed to generate scenes");
                return;
            }
            const scenesArray: string[] = Array.isArray(data.scenes) ? data.scenes : [];
            if (scenesArray.length === 0) {
                setIdeaError("No scenes returned — try a more detailed idea.");
                return;
            }
            setScenes(
                scenesArray.map((prompt, i) =>
                    makeScene(i, {
                        caption: prompt,
                        type: "video",
                        source: "ai",
                        duration: 6,
                        status: "empty",
                    })
                )
            );
        } catch (e) {
            setIdeaError(e instanceof Error ? e.message : "Failed to generate scenes");
        } finally {
            setIdeaLoading(false);
        }
    }, [ideaPrompt, ideaLoading, authHeaders]);

    // ── AI Video generation ────────────────────────────────────────────────────

    const startPollingVideoScene = useCallback(
        (sceneId: string, operationName: string) => {
            if (pollRefs.current[sceneId]) clearInterval(pollRefs.current[sceneId]);

            const poll = async () => {
                const headers = await authHeaders();
                if (!headers) return;
                try {
                    const res = await fetch(fnUrl("studio-reels-status"), {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ operation_name: operationName, is_final: true }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        clearInterval(pollRefs.current[sceneId]);
                        delete pollRefs.current[sceneId];
                        updateScene(sceneId, { status: "error", error: data.error ?? "Status check failed" });
                        return;
                    }
                    if (data.done) {
                        clearInterval(pollRefs.current[sceneId]);
                        delete pollRefs.current[sceneId];
                        if (data.error) {
                            updateScene(sceneId, { status: "error", error: data.error });
                        } else if (data.video_url) {
                            updateScene(sceneId, {
                                status: "ready",
                                asset_url: data.video_url,
                                asset_type: "video" as AssetType,
                                source: "ai",
                            });
                        } else {
                            updateScene(sceneId, { status: "error", error: "No video URL returned" });
                        }
                    }
                } catch {
                    clearInterval(pollRefs.current[sceneId]);
                    delete pollRefs.current[sceneId];
                    updateScene(sceneId, { status: "error", error: "Polling failed" });
                }
            };

            poll(); // immediate first check
            pollRefs.current[sceneId] = setInterval(poll, POLL_INTERVAL_MS);
        },
        [authHeaders, updateScene]
    );

    const generateAIVideo = useCallback(
        async (sceneId: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            if (!scene || !scene.caption?.trim()) return;
            if (!subscription.isSubscribed) return;
            if (subscription.reelsUsed >= subscription.reelsLimit) {
                updateScene(sceneId, { status: "error", error: "Reel limit reached for this period" });
                return;
            }

            const headers = await authHeaders();
            if (!headers) return;

            updateScene(sceneId, { status: "generating", error: undefined, asset_url: undefined, asset_type: undefined });

            try {
                const res = await fetch(fnUrl("studio-reels-generate"), {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        prompt: scene.caption.trim(),
                        reference_images_base64: scene.reference_image_base64
                            ? [scene.reference_image_base64]
                            : undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.operation_name) {
                    updateScene(sceneId, { status: "error", error: data.error ?? "Failed to start generation" });
                    return;
                }
                updateScene(sceneId, { operation_name: data.operation_name });
                startPollingVideoScene(sceneId, data.operation_name);
            } catch (e) {
                updateScene(sceneId, {
                    status: "error",
                    error: e instanceof Error ? e.message : "Generation failed",
                });
            }
        },
        [scenes, subscription, authHeaders, updateScene, startPollingVideoScene]
    );

    // ── AI Image generation ────────────────────────────────────────────────────

    const generateAIImage = useCallback(
        async (sceneId: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            if (!scene || !scene.caption?.trim()) return;
            if (!subscription.isSubscribed) return;
            if (subscription.imagesUsed >= subscription.imagesLimit) {
                updateScene(sceneId, { status: "error", error: "Image limit reached for this period" });
                return;
            }

            const headers = await authHeaders();
            if (!headers) return;

            updateScene(sceneId, { status: "generating", error: undefined, asset_url: undefined, asset_type: undefined });

            try {
                const res = await fetch(fnUrl("studio-generator"), {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        target_names: "Scene",
                        context_description: scene.caption.trim(),
                        tone: "bold",
                        reference_image_base64: scene.reference_image_base64 ?? undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.image_url) {
                    updateScene(sceneId, { status: "error", error: data.error ?? "Image generation failed" });
                    return;
                }
                updateScene(sceneId, {
                    status: "ready",
                    asset_url: data.image_url,
                    asset_type: "image" as AssetType,
                    source: "ai",
                    duration: 4,
                });
            } catch (e) {
                updateScene(sceneId, {
                    status: "error",
                    error: e instanceof Error ? e.message : "Image generation failed",
                });
            }
        },
        [scenes, subscription, authHeaders, updateScene]
    );

    // ── Unified generate handler ───────────────────────────────────────────────

    const handleGenerateAI = useCallback(
        (sceneId: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            if (!scene) return;
            if (scene.type === "video") {
                generateAIVideo(sceneId);
            } else {
                generateAIImage(sceneId);
            }
        },
        [scenes, generateAIVideo, generateAIImage]
    );

    const handleRegenerateAI = useCallback(
        (sceneId: string) => {
            // Clear existing poll if any
            if (pollRefs.current[sceneId]) {
                clearInterval(pollRefs.current[sceneId]);
                delete pollRefs.current[sceneId];
            }
            updateScene(sceneId, {
                status: "empty",
                asset_url: undefined,
                asset_type: undefined,
                operation_name: undefined,
                error: undefined,
            });
            setTimeout(() => handleGenerateAI(sceneId), 0);
        },
        [updateScene, handleGenerateAI]
    );

    // ── File upload ────────────────────────────────────────────────────────────

    const handleUploadFile = useCallback(
        async (sceneId: string, file: File) => {
            const session = await getSession();
            if (!session) return;

            updateScene(sceneId, { status: "generating", error: undefined, source: "upload" });

            const isVideo = file.type.startsWith("video/");
            const bucket = isVideo ? "studio-videos" : "studio-images";
            const ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
            const filePath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

            try {
                const { error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(filePath, file, { contentType: file.type, upsert: false });

                if (uploadError) {
                    updateScene(sceneId, { status: "error", error: uploadError.message });
                    return;
                }

                const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
                const publicUrl = urlData.publicUrl;

                // Read video duration from metadata
                let duration = isVideo ? 6 : 3;
                if (isVideo) {
                    try {
                        duration = await new Promise<number>((resolve) => {
                            const vid = document.createElement("video");
                            vid.preload = "metadata";
                            vid.onloadedmetadata = () => {
                                resolve(Math.round(vid.duration) || 6);
                                URL.revokeObjectURL(vid.src);
                            };
                            vid.onerror = () => resolve(6);
                            vid.src = URL.createObjectURL(file);
                        });
                    } catch {
                        duration = 6;
                    }
                }

                updateScene(sceneId, {
                    status: "ready",
                    asset_url: publicUrl,
                    asset_type: (isVideo ? "video" : "image") as AssetType,
                    type: (isVideo ? "video" : "image") as SceneType,
                    source: "upload",
                    duration,
                });
            } catch (e) {
                updateScene(sceneId, {
                    status: "error",
                    error: e instanceof Error ? e.message : "Upload failed",
                });
            }
        },
        [getSession, updateScene]
    );

    // ── AI Image Edit ────────────────────────────────────────────────────────
    const handleAIEditImage = useCallback(
        async (sceneId: string, instruction: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            if (!scene?.asset_url) return;

            const headers = await authHeaders();
            if (!headers) return;

            updateScene(sceneId, { status: "generating", error: undefined });

            try {
                const res = await fetch(fnUrl("studio-image-edit"), {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        image_url: scene.asset_url,
                        edit_instruction: instruction,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.image_url) {
                    updateScene(sceneId, { status: "error", error: data.error ?? "AI edit failed" });
                    return;
                }
                updateScene(sceneId, {
                    status: "ready",
                    asset_url: data.image_url,
                    asset_type: "image" as AssetType,
                });
            } catch (e) {
                updateScene(sceneId, {
                    status: "error",
                    error: e instanceof Error ? e.message : "AI edit failed",
                });
            }
        },
        [scenes, authHeaders, updateScene]
    );

    // ── Render guards ──────────────────────────────────────────────────────────

    if (authLoading || subscription.loading) {
        return (
            <div className={styles.wrap}>
                <div className={styles.loadingState}>Loading…</div>
            </div>
        );
    }

    if (!user) {
        router.push("/");
        return null;
    }

    if (!subscription.isSubscribed) {
        return (
            <div className={styles.wrap}>
                <div className={styles.gateWrap}>
                    <div className={styles.gateTitle}>Studio Editor</div>
                    <p className={styles.gateText}>
                        A subscription is required to use the Studio Editor. Upgrade to start building scene-based videos.
                    </p>
                    <button
                        className={styles.gateBtn}
                        onClick={() => router.push("/pricing")}
                    >
                        View Plans
                    </button>
                </div>
            </div>
        );
    }

    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);

    return (
        <div className={styles.wrap}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <h1 className={styles.title}>
                    Video <em className={styles.titleAccent}>Editor</em>
                </h1>
                <p className={styles.subtitle}>
                    Build a timeline of scenes. Generate AI video or images, upload your own, then preview as a sequence.
                </p>
            </div>

            {/* Generate From Idea */}
            <div className={styles.ideaSection}>
                <label className={styles.ideaLabel} htmlFor="idea-input">
                    Generate scenes from an idea
                </label>
                {ideaError && <div className={styles.errorBanner}>{ideaError}</div>}
                <div className={styles.ideaInputRow}>
                    <textarea
                        id="idea-input"
                        className={styles.ideaInput}
                        value={ideaPrompt}
                        onChange={(e) => setIdeaPrompt(e.target.value)}
                        placeholder="e.g. Luxury bathroom renovation reveal…"
                        rows={2}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleGenerateFromIdea();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className={styles.ideaBtn}
                        onClick={handleGenerateFromIdea}
                        disabled={ideaLoading || !ideaPrompt.trim()}
                    >
                        {ideaLoading ? (
                            <><span className={styles.ideaSpinner} />Thinking…</>
                        ) : (
                            "Generate Scenes"
                        )}
                    </button>
                </div>
            </div>

            {/* Timeline bar — only shown when there are scenes */}
            {scenes.length > 0 && (
                <div className={styles.timelineBar}>
                    <div className={styles.timelineMeta}>
                        <span className={styles.metaItem}>
                            Duration <span className={styles.metaValue}>{totalDuration}s</span>
                        </span>
                        <span className={styles.metaItem}>
                            Scenes <span className={styles.metaValue}>{scenes.length}</span>
                        </span>
                        <span className={styles.metaItem}>
                            Ready <span className={styles.metaValue}>{readyCount} / {scenes.length}</span>
                        </span>
                    </div>
                    <button
                        type="button"
                        className={styles.createVideoBtn}
                        onClick={() => setPlayerOpen(true)}
                        disabled={readyCount === 0}
                        title={readyCount === 0 ? "Generate at least one scene first" : "Preview full sequence"}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        {allReady ? "Preview Full Reel" : `Preview (${readyCount} ready)`}
                    </button>
                </div>
            )}

            {/* Timeline */}
            {scenes.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No scenes yet</div>
                    <p className={styles.emptyText}>
                        Start by generating scenes from an idea above,<br />or add a blank scene to begin manually.
                    </p>
                    <button type="button" className={styles.emptyAddBtn} onClick={addScene}>
                        + Add Scene
                    </button>
                </div>
            ) : (
                <div className={styles.timelineOuter}>
                    <div className={styles.timelineScroll}>
                        <div className={styles.timelineInner}>
                            {sortedScenes.map((scene, i) => (
                                <React.Fragment key={scene.id}>
                                    <SceneCard
                                        scene={scene}
                                        index={i}
                                        onUpdate={updateScene}
                                        onDelete={deleteScene}
                                        onInsertAfter={insertSceneAfter}
                                        onGenerateAI={handleGenerateAI}
                                        onRegenerateAI={handleRegenerateAI}
                                        onAIEditImage={handleAIEditImage}
                                        onUploadFile={handleUploadFile}
                                        onMove={moveScene}
                                    />
                                    {i < sortedScenes.length - 1 && (
                                        <div className={styles.arrow}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 18 15 12 9 6" />
                                            </svg>
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}

                            {/* Add scene button */}
                            <button
                                type="button"
                                className={styles.addSceneBtn}
                                onClick={addScene}
                            >
                                <span className={styles.addIconWrap}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                </span>
                                Add Scene
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Video sequence player */}
            {playerOpen && (
                <VideoSequencePlayer
                    scenes={sortedScenes}
                    onClose={() => setPlayerOpen(false)}
                />
            )}
        </div>
    );
}
