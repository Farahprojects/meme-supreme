"use client";

import { useState, useEffect } from "react";
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
    const [optionalSign, setOptionalSign] = useState("");

    // Result state
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStep("checkout");
            setLoadingMsgIdx(0);
            setTargetNames("");
            setContextDesc("");
            setOptionalSign("");
            setGeneratedImage(null);
            setErrorMsg(null);
        }
    }, [isOpen]);

    // Handle generation process
    useEffect(() => {
        if (step === "generating") {
            const msgInterval = setInterval(() => {
                setLoadingMsgIdx((prev) => (prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev));
            }, 1000);

            let supabaseClient: any = null;
            let channel: any = null;
            let pollingInterval: NodeJS.Timeout | null = null;

            // Clean up everything (sockets, polling, UI intervals)
            const stopListening = () => {
                if (pollingInterval) clearInterval(pollingInterval);
                if (supabaseClient && channel) supabaseClient.removeChannel(channel);
            };

            const generateAndSubscribe = async () => {
                try {
                    const sessionId = crypto.randomUUID();
                    const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
                    const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
                    const supabaseUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || 'https://wrvqqvqvwqmfdqvqmaar.supabase.co';

                    if (!anonKey) {
                        throw new Error("Missing NEXT_PUBLIC_THERAI_ANON_KEY in .env.local");
                    }

                    // 1. Initialize Supabase
                    const { createClient } = require('@supabase/supabase-js');
                    supabaseClient = createClient(supabaseUrl, anonKey);

                    // 2. Setup Realtime Listener (Primary/Fast mechanism)
                    channel = supabaseClient.channel(`memeroast:${sessionId}`);
                    channel.on('broadcast', { event: 'meme-complete' }, (payload: any) => {
                        console.log('⚡ Received meme-complete broadcast:', payload);
                        if (payload.payload?.meme?.image_url) {
                            setGeneratedImage(payload.payload.meme.image_url);
                            setStep("result");
                            stopListening();
                        }
                    }).subscribe();

                    // 3. Dispatch the generation job to the worker
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
                            optional_sign: optionalSign
                        })
                    });

                    if (!res.ok) throw new Error(`Generation failed: ${await res.text()}`);
                    const data = await res.json();

                    if (!data.success) {
                        throw new Error(data.error || 'Failed to dispatch generation task');
                    }

                    // 4. Setup Fallback Polling (Every 5 seconds)
                    // If Realtime drops, the HTTP poll will catch the update in the DB.
                    pollingInterval = setInterval(async () => {
                        try {
                            const { data: dbCheck, error } = await supabaseClient
                                .from('memeroast_images')
                                .select('status, image_url')
                                .eq('session_id', sessionId)
                                .single();

                            if (!error && dbCheck?.status === 'complete' && dbCheck?.image_url) {
                                console.log('⏱️ Polling caught completed meme!');
                                setGeneratedImage(dbCheck.image_url);
                                setStep("result");
                                stopListening();
                            } else if (dbCheck?.status === 'failed') {
                                throw new Error('Backend reported generation failed.');
                            }
                        } catch (pollErr) {
                            console.error('Polling error:', pollErr);
                            // We don't abort on single network failures, let it try again on next poll
                            // unless the DB explicitly says 'failed'.
                            if (pollErr instanceof Error && pollErr.message.includes('failed')) {
                                setErrorMsg('Generation failed on the server.');
                                setStep("result");
                                stopListening();
                            }
                        }
                    }, 5000);

                } catch (e) {
                    console.error('Failed to dispatch generation task:', e);
                    setErrorMsg(e instanceof Error ? e.message : 'Unknown error occurred');
                    setStep("result");
                    stopListening();
                }
            };

            generateAndSubscribe();

            return () => {
                clearInterval(msgInterval);
                stopListening();
            };
        }
    }, [step, selectedProduct, targetNames, contextDesc, optionalSign]);

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
                                <label>Optional: Birth Date / Sign</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Gemini or Oct 12"
                                    value={optionalSign}
                                    onChange={(e) => setOptionalSign(e.target.value)}
                                />
                            </div>

                            <button
                                className={styles.primaryButton}
                                disabled={!targetNames || !contextDesc}
                                onClick={() => setStep("generating")}
                            >
                                Generate Meme
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Loading / Generating */}
                {step === "generating" && (
                    <div className={`${styles.content} ${styles.centerContent}`}>
                        <div className={styles.spinner}></div>
                        <h2 className={`${styles.title} ${styles.pulsingText}`}>
                            {LOADING_MESSAGES[loadingMsgIdx]}
                        </h2>
                    </div>
                )}

                {/* Step 4: Result */}
                {step === "result" && (
                    <div className={`${styles.content} ${styles.resultContent}`}>
                        {errorMsg ? (
                            <>
                                <h2 className={styles.title}>Generation Failed</h2>
                                <p style={{ color: 'red', marginTop: '1rem', marginBottom: '2rem' }}>{errorMsg}</p>
                                <div className={styles.actionButtons}>
                                    <button
                                        className={styles.secondaryButton}
                                        onClick={() => setStep("details")}
                                    >
                                        Try Again
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className={styles.title}>Roasted.</h2>

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

                                <div className={styles.actionButtons}>
                                    {generatedImage && (
                                        <a
                                            href={generatedImage}
                                            download="roast-meme.jpg"
                                            target="_blank"
                                            rel="noreferrer"
                                            className={styles.primaryButton}
                                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            ↓ Save Image
                                        </a>
                                    )}
                                    <button
                                        className={styles.secondaryButton}
                                        onClick={() => setStep("details")}
                                    >
                                        Generate Another
                                    </button>
                                    <button
                                        className={styles.textButton}
                                        onClick={onClose}
                                    >
                                        Back to Store
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
