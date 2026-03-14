import { useState, useRef } from "react";
import styles from "../SceneCard.module.css";

interface AIEditOverlayProps {
    onClose: () => void;
    onSubmit: (instruction: string) => void;
    loading: boolean;
    instruction: string;
    setInstruction: (v: string) => void;
}

export default function AIEditOverlay({
    onClose,
    onSubmit,
    loading,
    instruction,
    setInstruction,
}: AIEditOverlayProps) {
    const editInstructionRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = () => {
        if (!instruction.trim() || loading) return;
        onSubmit(instruction.trim());
    };

    return (
        <div className={styles.aiOverlay}>
            <div className={styles.aiOverlayTopRow}>
                <div className={styles.aiEditLabel}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                    </svg>
                    AI Edit
                </div>
                <button type="button" className={styles.aiOverlayClose} onClick={onClose} aria-label="Close">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <textarea
                ref={editInstructionRef}
                className={styles.aiOverlayPrompt}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe your edit… (e.g. make the sky pink, add sunglasses)"
                rows={4}
                autoFocus
                onKeyDown={(e) => { 
                    if (e.key === "Enter" && !e.shiftKey) { 
                        e.preventDefault(); 
                        handleSubmit(); 
                    } 
                }}
            />
            {/* Internal buttons removed - handled by SceneCard infoBar */}
        </div>
    );
}
