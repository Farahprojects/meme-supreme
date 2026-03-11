"use client";

import { useState, useRef } from "react";
import styles from "./DashboardChatBar.module.css";

export default function DashboardChatBar() {
    const [prompt, setPrompt] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 116)}px`;
        }
    };

    return (
        <div className={styles.chatBarContainer}>
            <div className={styles.chatBar}>
                <button className={styles.attachBtn} title="Add Image">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                <textarea
                    ref={textareaRef}
                    className={styles.chatInput}
                    placeholder="Describe your meme..."
                    value={prompt}
                    onChange={handleInput}
                    rows={1}
                />
                <button className={styles.sendBtn} title="Create Meme">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    );
}
