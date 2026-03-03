"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import styles from "./PurchaseModal.module.css";

interface PurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProduct: {
        title: string;
        price: string;
        type: string;
    } | null;
}

type Step = "checkout" | "details" | "generating" | "result";

const LOADING_MESSAGES = [
    "Initializing chaotic energy...",
    "Analyzing internet history...",
    "Finding roast material...",
    "Applying emotional damage...",
    "Generating meme...",
    "Almost done..."
];

export default function PurchaseModal({ isOpen, onClose, selectedProduct }: PurchaseModalProps) {
    const [step, setStep] = useState<Step>("checkout");
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

    // Form state
    const [targetNames, setTargetNames] = useState("");
    const [contextDesc, setContextDesc] = useState("");
    const [optionalDate, setOptionalDate] = useState("");
    const [optionalLocation, setOptionalLocation] = useState("");

    // Result state
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isMemeReadyBtnVisible, setIsMemeReadyBtnVisible] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStep("checkout");
            setLoadingMsgIdx(0);
            setTargetNames("");
            setContextDesc("");
            setOptionalDate("");
            setOptionalLocation("");
            setGeneratedImage(null);
            setErrorMsg(null);
            setCurrentSessionId(null);
            setIsMemeReadyBtnVisible(false);
            setIsPolling(false);
        }
    }, [isOpen]);

    // Generation state management via refs (prevents re-render teardowns)
    const supabaseClientRef = useRef<any>(null);

    // Handle loading text pulsing & Meme Ready Button Timeout
    useEffect(() => {
        let msgInterval: NodeJS.Timeout;
        let btnTimeout: NodeJS.Timeout;

        if (step === "generating") {
            msgInterval = setInterval(() => {
                setLoadingMsgIdx((prev) => (prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev));
            }, 1000);

            btnTimeout = setTimeout(() => {
                setIsMemeReadyBtnVisible(true);
            }, 8000);
        }
        return () => {
            clearInterval(msgInterval);
            clearTimeout(btnTimeout);
        };
    }, [step]);

    const startGeneration = async () => {
        setStep("generating");
        setLoadingMsgIdx(0);

        try {
            const sessionId = crypto.randomUUID();
            setCurrentSessionId(sessionId);
            const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
            const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
            const supabaseUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || 'https://wrvqqvqvwqmfdqvqmaar.supabase.co';

            if (!anonKey) {
                throw new Error("Missing NEXT_PUBLIC_THERAI_ANON_KEY in .env.local");
            }

            // 1. Initialize Supabase
            const { createClient } = require('@supabase/supabase-js');
            const client = createClient(supabaseUrl, anonKey);
            supabaseClientRef.current = client;

            // 2. Dispatch the generation job to the worker
            const res = await fetch(`${apiUrl}/memeroast-worker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    product_type: selectedProduct?.type || 'Roast',
                    target_names: targetNames,
                    context_description: contextDesc,
                    optional_date: optionalDate,
                    optional_location: optionalLocation
                })
            });

            if (!res.ok) throw new Error(`Generation failed: ${await res.text()}`);
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to dispatch generation task');
            }



        } catch (e) {
            console.error('Failed to dispatch generation task:', e);
            setErrorMsg(e instanceof Error ? e.message : 'Unknown error occurred');
            setStep("result");
        }
    };

    const handleMemeReady = async () => {
        if (!currentSessionId || !supabaseClientRef.current) return;
        setIsPolling(true);
        let attempts = 0;

        const poll = async () => {
            attempts++;
            try {
                console.log(`Polling attempt ${attempts} for session:`, currentSessionId);
                const { data, error } = await supabaseClientRef.current
                    .from('memeroast_images')
                    .select('status, image_url')
                    .eq('session_id', currentSessionId)
                    .single();

                if (data?.status === 'complete' && data?.image_url) {
                    setGeneratedImage(data.image_url);
                    setStep("result");
                    setIsPolling(false);
                    return;
                } else if (data?.status === 'failed') {
                    setErrorMsg('Backend explicitly flagged status as failed.');
                    setStep("result");
                    setIsPolling(false);
                    return;
                }
            } catch (err) {
                console.error("Polling fetch error", err);
            }

            if (attempts >= 5) {
                setErrorMsg('Generation is taking longer than expected. Please try again or check back later.');
                setStep("result");
                setIsPolling(false);
            } else {
                setTimeout(poll, 1000);
            }
        };

        poll();
    };

    const forceDownload = async (url: string) => {
        try {
            setIsDownloading(true);
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network response was not ok");
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = blobUrl;
            a.download = `roasted-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Failed to download image", err);
            alert("Failed to download the image. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    if (!isOpen || !selectedProduct) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                data-step={step}
            >
                <button className={styles.closeButton} onClick={onClose}>
                    ✕
                </button>

                {/* Step 1: Checkout (Payment Bypassed for Testing) */}
                {step === "checkout" && (
                    <div className={styles.content}>
                        <h2 className={styles.title}>Confirm Purchase (Test Mode)</h2>
                        <div className={styles.productSummary}>
                            <div className={styles.productInfo}>
                                <span className={styles.productName}>{selectedProduct.title}</span>
                                <span className={styles.productType}>{selectedProduct.type}</span>
                            </div>
                            <span className={styles.productPrice}>{selectedProduct.price}</span>
                        </div>

                        <div className={styles.guestCheckoutBox}>
                            <p>Guest Checkout</p>
                            <div className={styles.fakeApplePay}>
                                Bypass Payment (Testing)
                            </div>
                        </div>

                        <button
                            className={styles.primaryButton}
                            onClick={() => setStep("details")}
                        >
                            Bypass Pay & Continue
                        </button>
                        <p className={styles.fineprint}>Payment is currently disabled for testing.</p>
                    </div>
                )}

                {/* Step 2: Input Details */}
                {step === "details" && (
                    <div className={styles.content}>
                        <h2 className={styles.title}>Supply the Target</h2>
                        <p className={styles.subtitle}>Give us the ammo for the {selectedProduct.title}.</p>

                        <div className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label>Name(s)</label>
                                <input
                                    type="text"
                                    placeholder="Who are we roasting?"
                                    value={targetNames}
                                    onChange={(e) => setTargetNames(e.target.value)}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Context / Description</label>
                                <textarea
                                    placeholder="e.g. They think they're a DJ, always late, loves oat milk..."
                                    rows={3}
                                    value={contextDesc}
                                    onChange={(e) => setContextDesc(e.target.value)}
                                ></textarea>
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Birth Date (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="DD/MM/YYYY"
                                    value={optionalDate}
                                    onChange={(e) => setOptionalDate(e.target.value)}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Birth Location (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="City (e.g. London)"
                                    value={optionalLocation}
                                    onChange={(e) => setOptionalLocation(e.target.value)}
                                />
                            </div>

                            <button
                                className={styles.primaryButton}
                                disabled={!targetNames || !contextDesc}
                                onClick={startGeneration}
                            >
                                Generate Meme
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Loading / Generating */}
                {step === "generating" && (
                    <div className={`${styles.content} ${styles.centerContent}`}>
                        {!isMemeReadyBtnVisible && (
                            <div className={styles.spinner}></div>
                        )}
                        <h2 className={`${styles.title} ${!isMemeReadyBtnVisible ? styles.pulsingText : ''}`}>
                            {!isMemeReadyBtnVisible ? LOADING_MESSAGES[loadingMsgIdx] : "Generation Cycle Complete"}
                        </h2>

                        {isMemeReadyBtnVisible && (
                            <div style={{ marginTop: '2rem' }}>
                                <button
                                    onClick={handleMemeReady}
                                    className={styles.primaryButton}
                                    style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', width: '100%' }}
                                    disabled={isPolling}
                                >
                                    {isPolling ? 'Checking...' : 'Meme Ready'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Result */}
                {step === "result" && (
                    <div className={`${styles.content} ${styles.resultContent}`}>
                        {errorMsg ? (
                            <div style={{ padding: '40px 30px', textAlign: 'center' }}>
                                <h2 className={styles.title} style={{ fontSize: '1.5rem' }}>Generation Failed</h2>
                                <p style={{ color: '#ff3366', marginTop: '1rem', marginBottom: '2rem' }}>{errorMsg}</p>
                                <button
                                    className={styles.secondaryButton}
                                    onClick={() => setStep("details")}
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className={styles.resultImageContainer}>
                                    {generatedImage && (
                                        <Image
                                            src={generatedImage}
                                            alt="Generated Roast Meme"
                                            fill
                                            className={styles.resultImage}
                                            unoptimized={true}
                                        />
                                    )}
                                </div>

                                <div className={styles.floatingActions}>
                                    {generatedImage && (
                                        <button
                                            onClick={() => forceDownload(generatedImage)}
                                            className={styles.iconButton}
                                            disabled={isDownloading}
                                            aria-label="Download Image"
                                            style={{ opacity: isDownloading ? 0.7 : 1 }}
                                        >
                                            {isDownloading ? (
                                                <div className={styles.spinner} style={{ width: 24, height: 24, borderWidth: 2, marginBottom: 0 }}></div>
                                            ) : (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                    <button
                                        className={styles.iconButton}
                                        onClick={onClose}
                                        aria-label="Back to Store"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                                        </svg>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
