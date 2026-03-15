"use client";

import { useRef, useState } from "react";
import styles from "./ReelResult.module.css";

export interface ReelResultProps {
    videoUrl: string;
    onDownload?: () => void;
    onDelete?: () => void;
}

export default function ReelResult({ videoUrl, onDownload, onDelete }: ReelResultProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [copied, setCopied] = useState(false);

    const handleDownload = () => {
        if (onDownload) {
            onDownload();
            return;
        }
        const a = document.createElement("a");
        a.href = videoUrl;
        a.download = `meme-supreme-reel-${Date.now()}.mp4`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleShare = async () => {
        const shareData = { title: "Meme Supreme", text: "Check out this reel I made on Meme Supreme", url: videoUrl };
        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData);
            } catch {
                // user cancelled
            }
            return;
        }
        // Fallback: copy as rich text so it pastes as a hyperlink in Gmail/Slack/Notion,
        // and as a plain URL in WhatsApp/SMS/plain text editors.
        try {
            const html = `<a href="${videoUrl}">Meme Supreme</a>`;
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([videoUrl], { type: "text/plain" }),
                }),
            ]);
        } catch {
            // ClipboardItem not supported — plain URL fallback
            await navigator.clipboard.writeText(videoUrl);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.card}>
            <div className={styles.videoWrapper}>
                <video
                    ref={videoRef}
                    className={styles.video}
                    src={videoUrl}
                    controls
                    playsInline
                    loop
                    muted
                    preload="metadata"
                />
            </div>
            <div className={styles.actionBar}>
                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={handleDownload}
                    title="Download reel"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </button>

                <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={handleShare}
                    title={copied ? "Link copied!" : "Share reel"}
                >
                    {copied ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                    )}
                </button>

                {onDelete && (
                    <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                        onClick={onDelete}
                        title="Delete reel"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
