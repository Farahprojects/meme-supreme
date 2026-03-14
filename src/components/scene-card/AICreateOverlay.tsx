import { useState, useRef } from "react";
import styles from "../SceneCard.module.css";
import { SceneType } from "./types";

interface AICreateOverlayProps {
    onClose: () => void;
    onGenerate: (caption: string, type: SceneType, refImage: File | null) => void;
    initialType: SceneType;
    initialPrompt: string;
}

export default function AICreateOverlay({
    onClose,
    onGenerate,
    initialType,
    initialPrompt,
}: AICreateOverlayProps) {
    const [overlayPrompt, setOverlayPrompt] = useState(initialPrompt);
    const [overlayType, setOverlayType] = useState<SceneType>(initialType);
    const [refImage, setRefImage] = useState<File | null>(null);
    const [refPreview, setRefPreview] = useState<string | null>(null);
    const promptRef = useRef<HTMLTextAreaElement>(null);
    const refInputRef = useRef<HTMLInputElement>(null);

    const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRefImage(file);
        setRefPreview(URL.createObjectURL(file));
        e.target.value = "";
    };

    const removeRefImage = () => {
        if (refPreview) URL.revokeObjectURL(refPreview);
        setRefImage(null);
        setRefPreview(null);
    };

    const handleSend = () => {
        if (!overlayPrompt.trim()) {
            promptRef.current?.focus();
            return;
        }
        onGenerate(overlayPrompt.trim(), overlayType, refImage);
    };

    return (
        <div className={styles.aiOverlay}>
            <div className={styles.aiOverlayTopRow}>
                <div className={styles.aiTypeToggle}>
                    <button 
                        type="button" 
                        className={`${styles.aiTypeBtn} ${overlayType === "video" ? styles.aiTypeBtnActive : ""}`} 
                        onClick={() => setOverlayType("video")}
                    >Video</button>
                    <button 
                        type="button" 
                        className={`${styles.aiTypeBtn} ${overlayType === "image" ? styles.aiTypeBtnActive : ""}`} 
                        onClick={() => setOverlayType("image")}
                    >Image</button>
                </div>
                <button type="button" className={styles.aiOverlayClose} onClick={onClose} aria-label="Close">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <textarea 
                ref={promptRef} 
                className={styles.aiOverlayPrompt} 
                value={overlayPrompt}
                onChange={(e) => setOverlayPrompt(e.target.value)} 
                placeholder="Describe this scene…" 
                rows={4}
                autoFocus
                onKeyDown={(e) => { 
                    if (e.key === "Enter" && !e.shiftKey) { 
                        e.preventDefault(); 
                        handleSend(); 
                    } 
                }} 
            />
            <div className={styles.aiOverlayBottom}>
                <div className={styles.aiRefRow}>
                    <label className={styles.aiRefBtn} title="Add reference image">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <input ref={refInputRef} type="file" accept="image/*" className={styles.fileInputHidden} onChange={handleRefImageChange} />
                    </label>
                    {refPreview && (
                        <div className={styles.aiRefThumb}>
                            <img src={refPreview} alt="Reference" className={styles.aiRefThumbImg} />
                            <button type="button" className={styles.aiRefThumbRemove} onClick={removeRefImage} aria-label="Remove">
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
                <button type="button" className={styles.aiOverlayGenBtn} onClick={handleSend} disabled={!overlayPrompt.trim()}>Send</button>
            </div>
        </div>
    );
}
