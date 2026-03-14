"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./VideoSequencePlayer.module.css";
import sceneStyles from "./SceneCard.module.css";
import type { Scene } from "./SceneCard";
import { hexToRgba } from "./SceneCard";

interface VideoSequencePlayerProps {
    scenes: Scene[];
    onClose: () => void;
}

export default function VideoSequencePlayer({ scenes, onClose }: VideoSequencePlayerProps) {
    const [mounted, setMounted] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const lastUpdateRef = useRef<number>(0);

    const readyScenes = scenes.filter((s) => s.status === "ready" && s.asset_url);
    const current = readyScenes[currentIndex];

    // Calculate total sequence duration
    useEffect(() => {
        const total = readyScenes.reduce((acc, s) => acc + s.duration, 0);
        setTotalDuration(total);
    }, [readyScenes]);

    // Cap current time if duration shrinks
    useEffect(() => {
        if (currentTime > totalDuration) {
            setCurrentTime(totalDuration);
        }
    }, [totalDuration, currentTime]);

    // Track sequence-wide current time
    useEffect(() => {
        if (!isPlaying || isSeeking) return;

        let frameId: number;
        const update = () => {
            if (current?.asset_type === "video" && videoRef.current) {
                const baseTime = readyScenes.slice(0, currentIndex).reduce((acc, s) => acc + s.duration, 0);
                setCurrentTime(baseTime + videoRef.current.currentTime);
            } else if (current?.asset_type === "image") {
                const now = performance.now();
                if (lastUpdateRef.current > 0) {
                    const delta = (now - lastUpdateRef.current) / 1000;
                    setCurrentTime(prev => Math.min(totalDuration, prev + delta));
                }
                lastUpdateRef.current = now;
            }
            frameId = requestAnimationFrame(update);
        };

        lastUpdateRef.current = performance.now();
        frameId = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(frameId);
            lastUpdateRef.current = 0;
        };
    }, [isPlaying, isSeeking, current, currentIndex, readyScenes, totalDuration]);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // ESC to close
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const goNext = useCallback(() => {
        setCurrentIndex((prev) => {
            if (prev < readyScenes.length - 1) return prev + 1;
            return prev;
        });
    }, [readyScenes.length]);

    // Handle image scenes — auto-advance after duration
    useEffect(() => {
        if (!current || current.asset_type !== "image") return;
        if (!isPlaying || isSeeking) return;

        // Calculate time left in current scene
        const baseTime = readyScenes.slice(0, currentIndex).reduce((acc, s) => acc + s.duration, 0);
        const elapsedInScene = currentTime - baseTime;
        const timeLeft = (current.duration - elapsedInScene) * 1000;

        if (timeLeft <= 0) {
            if (currentIndex < readyScenes.length - 1) goNext();
            else setIsPlaying(false);
            return;
        }

        const timer = setTimeout(() => {
            if (currentIndex < readyScenes.length - 1) goNext();
            else setIsPlaying(false);
        }, timeLeft);

        return () => clearTimeout(timer);
    }, [current, currentIndex, isPlaying, isSeeking, currentTime, readyScenes, goNext]);

    // Handle video scenes — sync play/pause state
    useEffect(() => {
        const vid = videoRef.current;
        if (!vid) return;

        // Proactively sync playback rate if duration changes
        if (current?.duration > 0 && vid.duration > 0) {
            const desiredRate = vid.duration / current.duration;
            if (vid.playbackRate !== desiredRate) {
                vid.playbackRate = desiredRate;
            }
        }

        if (isPlaying && !isSeeking) {
            vid.play().catch(() => {});
        } else {
            vid.pause();
        }
    }, [isPlaying, isSeeking, current?.duration, current?.asset_url]);

    const handleVideoEnded = () => {
        if (currentIndex < readyScenes.length - 1) {
            goNext();
        } else {
            setIsPlaying(false);
        }
    };

    const handleSeek = (val: number) => {
        setCurrentTime(val);
        let accumulated = 0;
        for (let i = 0; i < readyScenes.length; i++) {
            const scene = readyScenes[i];
            if (val < accumulated + scene.duration) {
                setCurrentIndex(i);
                if (scene.asset_type === "video" && videoRef.current) {
                    videoRef.current.currentTime = val - accumulated;
                }
                break;
            }
            accumulated += scene.duration;
        }
    };

    const togglePlay = () => {
        setIsPlaying((prev) => !prev);
    };

    if (!mounted) return null;

    const content = (
        <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={styles.panel}>
                {readyScenes.length === 0 ? (
                    <div className={styles.emptyState}>No ready scenes</div>
                ) : (
                    <>
                        <div className={styles.mediaWrap}>
                            {/* Top bar */}
                                <div className={styles.topBar}>
                                    <div className={styles.topBarLeft} />
                                    <button
                                        type="button"
                                        className={styles.closeBtn}
                                        onClick={onClose}
                                        aria-label="Close player"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>

                            {/* Media */}
                            {current?.asset_type === "video" ? (
                                <video
                                    ref={videoRef}
                                    key={current.asset_url}
                                    className={styles.mediaVideo}
                                    src={current.asset_url}
                                    playsInline
                                    onEnded={handleVideoEnded}
                                    onLoadedMetadata={(e) => {
                                        const video = e.currentTarget;
                                        if (current.duration > 0 && video.duration > 0) {
                                            video.playbackRate = video.duration / current.duration;
                                        }
                                    }}
                                    muted={false}
                                />
                            ) : current?.asset_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    className={`${styles.mediaImage} ${current.motion && current.motion !== "none" ? sceneStyles[`motion-${current.motion}`] : ""}`}
                                    src={current.asset_url}
                                    alt={`Scene ${currentIndex + 1}`}
                                    style={{
                                        animationDuration: `${current.duration}s`,
                                        animationPlayState: isPlaying ? "running" : "paused"
                                    }}
                                />
                            ) : null}

                            {/* Text Overlay */}
                            {current?.textOverlay && current.textOverlay.text && (
                                <div
                                    className={sceneStyles.textBoundingBox}
                                    style={{
                                        left: `${current.textOverlay.x}%`,
                                        top: `${current.textOverlay.y}%`,
                                        transform: `translate(-50%, -50%) scale(${current.textOverlay.scale}) rotate(${current.textOverlay.rotation}deg)`,
                                        color: current.textOverlay.color,
                                        background: current.textOverlay.bg ? hexToRgba(current.textOverlay.bg, current.textOverlay.bgOpacity) : "transparent",
                                        pointerEvents: "none",
                                        display: "inline-block",
                                        position: "absolute",
                                        border: "none",
                                    }}
                                >
                                    <div
                                        className={sceneStyles.textEl}
                                        dangerouslySetInnerHTML={{ __html: current.textOverlay.text }}
                                        style={{ pointerEvents: "none" }}
                                    />
                                </div>
                            )}

                        </div>

                        {/* Player Frame / Timeline Control Bar */}
                        <div className={styles.bottomSection}>
                            <button
                                type="button"
                                className={styles.bottomPlayBtn}
                                onClick={togglePlay}
                                aria-label={isPlaying ? "Pause" : "Play"}
                            >
                                {isPlaying ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="4" width="4" height="16" rx="1.5" />
                                        <rect x="14" y="4" width="4" height="16" rx="1.5" />
                                    </svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 6v12l10-6z" />
                                    </svg>
                                )}
                            </button>

                            <div className={styles.sliderContainer}>
                                <input
                                    type="range"
                                    className={styles.sequenceSlider}
                                    min={0}
                                    max={totalDuration}
                                    step={0.1}
                                    value={currentTime}
                                    onMouseDown={() => setIsSeeking(true)}
                                    onTouchStart={() => setIsSeeking(true)}
                                    onMouseUp={() => setIsSeeking(false)}
                                    onTouchEnd={() => setIsSeeking(false)}
                                    onChange={(e) => handleSeek(Number(e.target.value))}
                                />
                                <div className={styles.timeLabels}>
                                    <span>{currentTime.toFixed(1)}s</span>
                                    <span>{totalDuration.toFixed(1)}s</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
