"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useMemeHistory } from "@/hooks/useMemeHistory";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import styles from "./PurchaseModal.module.css";

interface PurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProduct: {
        title: string;
        price: string;
        type: string;
    } | null;
    initialOrderId?: string;
    initialStep?: Step;
}

type Step = "checkout" | "details" | "generating" | "result";

interface TargetPerson {
    name: string;
    date: string;
}


type Tone = "Funny" | "Sweet" | "Roast" | "Bold";


const LOADING_MESSAGES = [
    "Initializing chaotic energy...",
    "Analyzing internet history...",
    "Brewing the perfect vibe...",
    "Applying the personality...",
    "Generating meme supreme...",
    "Almost done..."

];

export default function PurchaseModal({ isOpen, onClose, selectedProduct, initialOrderId, initialStep }: PurchaseModalProps) {
    const [step, setStep] = useState<Step>(initialStep || "checkout");
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [orderId, setOrderId] = useState<string | null>(initialOrderId || null);

    // Form state
    const [targets, setTargets] = useState<TargetPerson[]>([{ name: "", date: "" }]);
    const [contextDesc, setContextDesc] = useState("");
    const [selectedTone, setSelectedTone] = useState<Tone>("Roast");
    const [showHint, setShowHint] = useState(false);

    const { addMeme } = useMemeHistory();

    // Result state
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isMemeReadyBtnVisible, setIsMemeReadyBtnVisible] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Reset state when opening (unless we received initialOrderId/initialStep)
    useEffect(() => {
        if (isOpen && !initialOrderId) {
            setStep("checkout");
            setLoadingMsgIdx(0);
            setTargets([{ name: "", date: "" }]);
            setContextDesc("");
            setSelectedTone("Roast");
            setGeneratedImage(null);
            setErrorMsg(null);
            setCurrentSessionId(null);
            setIsMemeReadyBtnVisible(false);
            setIsPolling(false);
            setOrderId(null);
        } else if (isOpen && initialOrderId) {
            setOrderId(initialOrderId);
            if (initialStep) setStep(initialStep);
        }
    }, [isOpen, initialOrderId, initialStep]);

    // Generation state management via refs (prevents re-render teardowns)
    const supabaseClientRef = useRef<SupabaseClient | null>(null);

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
            const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
            const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
            const supabaseUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || 'https://wrvqqvqvwqmfdqvqmaar.supabase.co';

            if (!anonKey) {
                throw new Error("Missing NEXT_PUBLIC_THERAI_ANON_KEY in .env.local");
            }

            // 1. Initialize Supabase
            const client = createClient(supabaseUrl, anonKey);
            supabaseClientRef.current = client;

            if (!orderId) {
                throw new Error("No order ID found. Please try purchasing again.");
            }
            setCurrentSessionId(orderId); // Use orderId as the tracker session

            // 2. Dispatch the generation job to the worker
            const res = await fetch(`${apiUrl}/memeroast-worker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`
                },
                body: JSON.stringify({
                    order_id: orderId,
                    product_type: selectedProduct?.type || 'Roast',
                    target_names: targets.map(t => t.name).filter(Boolean).join(", "),
                    context_description: contextDesc,
                    tone: selectedTone.toLowerCase(),
                    optional_date: targets.filter(t => t.date).map(t => `${t.name || 'Target'}: ${t.date || 'Unknown Date'}`).join(" | "),
                    optional_location: ""
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || 'Generation failed');
                } catch {
                    throw new Error(`Generation failed: ${errorText}`);
                }
            }

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
                if (!supabaseClientRef.current) return;
                const { data } = await supabaseClientRef.current
                    .from('memeroast_images')
                    .select('status, image_url')
                    .eq('session_id', currentSessionId)
                    .single();

                if (data?.status === 'complete' && data?.image_url) {
                    setGeneratedImage(data.image_url);
                    setStep("result");
                    setIsPolling(false);

                    // Save to Meme Vault
                    addMeme({
                        id: currentSessionId,
                        url: data.image_url,
                        tone: selectedTone.toUpperCase(),
                        targets: targets.map(t => t.name).filter(Boolean).join(", "),
                        timestamp: Date.now()
                    });

                    // Trigger Auto-download
                    setTimeout(() => {
                        forceDownload(data.image_url);
                    }, 500);

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
                setErrorMsg('We are a little busy right now, try the button below.');
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

                {/* Step 1: Checkout */}
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

                        <button
                            className={styles.primaryButton}
                            disabled={isCheckingOut}
                            onClick={async () => {
                                setIsCheckingOut(true);
                                try {
                                    const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
                                    const response = await fetch(`${apiUrl}/memesupreme-create-checkout`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            product_type: 'memesupreme-roast', // The product id added to price_list
                                            session_id: crypto.randomUUID()
                                        })
                                    });

                                    if (!response.ok) throw new Error("Failed to initialize checkout.");
                                    const data = await response.json();

                                    if (data.url) {
                                        window.location.href = data.url;
                                    } else {
                                        throw new Error("No checkout URL returned.");
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert("Could not start checkout. Please try again.");
                                    setIsCheckingOut(false);
                                }
                            }}
                        >
                            {isCheckingOut ? "Loading..." : `Buy for ${selectedProduct.price}`}
                        </button>
                        <button
                            className={styles.secondaryButton}
                            style={{ marginTop: '12px', width: '100%', opacity: 0.7 }}
                            onClick={() => {
                                const testId = `test-${crypto.randomUUID()}`;
                                setOrderId(testId);
                                setStep("details");
                            }}
                        >
                            Bypass Pay (Dev Mode)
                        </button>
                        <p className={styles.fineprint}>Secure checkout powered by Stripe. Apple Pay & Google Pay supported.</p>
                    </div>
                )}

                {/* Step 2: Input Details */}
                {step === "details" && (
                    <div className={styles.content}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                            <Image src="/assets/logo_white.png" alt="Meme Supreme Icon" width={32} height={32} />
                            <p style={{ margin: 0, color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>Explain the chaos. We&apos;ll meme it.</p>
                        </div>

                        <div className={styles.form}>
                            <div className={styles.inputGroup}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-end' }}>
                                    <label style={{ flex: '1 1 50%', margin: 0, fontSize: '0.85rem' }}>Name :</label>
                                    <div style={{ flex: '1 1 50%', position: 'relative' }}>
                                        <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                            Optional
                                            <button
                                                type="button"
                                                onClick={() => setShowHint(!showHint)}
                                                style={{ background: 'none', border: 'none', color: '#BFFF00', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                                            >
                                                Hint ✨
                                            </button>
                                        </label>
                                        {showHint && (
                                            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px', background: '#111', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', width: '220px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>Birthday (optional)</p>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#aaa', lineHeight: 1.4 }}>We use this to add astrology insights to your meme.</p>
                                            </div>
                                        )}
                                    </div>
                                    {targets.length > 1 && <div style={{ width: '24px' }}></div>}
                                </div>
                                {targets.map((target, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="Name"
                                            value={target.name}
                                            onChange={(e) => {
                                                const newTargets = [...targets];
                                                newTargets[idx].name = e.target.value;
                                                setTargets(newTargets);
                                            }}
                                            style={{ flex: '1 1 50%', minWidth: 0 }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD"
                                            value={target.date}
                                            onChange={(e) => {
                                                const newTargets = [...targets];
                                                newTargets[idx].date = e.target.value;
                                                setTargets(newTargets);
                                            }}
                                            style={{ flex: '1 1 50%', minWidth: 0 }}
                                        />

                                        {targets.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setTargets(targets.filter((_, i) => i !== idx))}
                                                style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                                                title="Remove"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setTargets([...targets, { name: "", date: "" }])}
                                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#aaa', padding: '6px 14px', borderRadius: '100px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'inline-block', marginTop: '8px' }}
                                >
                                    + Add Person
                                </button>
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
                                <label>Meme Tone</label>
                                <div className={styles.toneSelector}>
                                    {(["Funny", "Sweet", "Roast", "Bold"] as Tone[]).map((tone) => (
                                        <button
                                            key={tone}
                                            type="button"
                                            className={`${styles.toneOption} ${selectedTone === tone ? styles.activeTone : ""}`}
                                            onClick={() => setSelectedTone(tone)}
                                        >
                                            {tone}
                                        </button>
                                    ))}
                                </div>
                            </div>




                            <button
                                className={styles.primaryButton}
                                disabled={!targets.some(t => t.name) || !contextDesc}
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
                                <h2 className={styles.title} style={{ fontSize: '1.5rem' }}>Woops!</h2>
                                <p style={{ color: '#ffffff', marginTop: '1rem', marginBottom: '2rem' }}>{errorMsg}</p>
                                {errorMsg.includes("not allowed") && (
                                    <div style={{ marginBottom: '2rem' }}>
                                        <a href="/terms" style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
                                            Read Terms & Policies
                                        </a>
                                    </div>
                                )}
                                {currentSessionId && errorMsg.includes("busy right now") ? (
                                    <button
                                        className={styles.primaryButton}
                                        onClick={() => {
                                            setErrorMsg(null);
                                            setStep("generating");
                                            setIsMemeReadyBtnVisible(true);
                                            setTimeout(handleMemeReady, 100);
                                        }}
                                        style={{ marginBottom: '1rem' }}
                                    >
                                        Check now
                                    </button>
                                ) : (
                                    <button
                                        className={styles.secondaryButton}
                                        onClick={() => setStep("details")}
                                    >
                                        Try Again
                                    </button>
                                )}
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
