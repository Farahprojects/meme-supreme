"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useMemeHistory } from "@/hooks/useMemeHistory";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import styles from "./StudioForm.module.css";

interface StudioFormProps {
    initialOrderId?: string;
    initialStep?: Step;
}

type Step = "details" | "generating" | "result";

interface TargetPerson {
    name: string;
    date: string;
}

type Tone = "Funny" | "Sweet" | "Roast" | "Bold";

const LOADING_MESSAGES = [
    "Analyzing internet history...",
    "Brewing the perfect vibe...",
    "Applying the personality...",
    "Drafting the ultimate joke...",
    "Sprinkling in some chaos...",
    "Finalizing the meme...",
    "Almost done..."
];

export default function StudioForm({ initialOrderId, initialStep }: StudioFormProps) {
    const [step, setStep] = useState<Step>(initialStep || "details");
    const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // Form state
    const [targets, setTargets] = useState<TargetPerson[]>([{ name: "", date: "" }]);
    const [contextDesc, setContextDesc] = useState("");
    const [selectedTone, setSelectedTone] = useState<Tone>("Roast");
    const [showHint, setShowHint] = useState(false);
    const [credits, setCredits] = useState<number | null>(null);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);

    const getSessionId = () => {
        if (typeof window === 'undefined') return '';
        let sid = localStorage.getItem('memeSupremeSessionId');
        if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem('memeSupremeSessionId', sid);
        }
        return sid;
    };

    const { addMeme } = useMemeHistory();

    // Result state
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialOrderId || null);
    const [isMemeReadyBtnVisible, setIsMemeReadyBtnVisible] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const supabaseClientRef = useRef<SupabaseClient | null>(null);

    // Initialize from local storage if returning from Stripe or just loading
    useEffect(() => {
        const sid = getSessionId();

        const fetchCredits = async () => {
            const supabaseUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || 'https://wrvqqvqvwqmfdqvqmaar.supabase.co';
            const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
            const client = supabaseClientRef.current || createClient(supabaseUrl, anonKey);
            if (!supabaseClientRef.current) supabaseClientRef.current = client;

            try {
                const { data } = await client
                    .from('memesupreme_credits')
                    .select('credits_remaining')
                    .eq('session_id', sid)
                    .single();

                setCredits(data ? data.credits_remaining : 0);
            } catch (e) {
                setCredits(0);
            }
        };

        fetchCredits();

        if (initialOrderId && initialStep === "generating") {
            const savedData = localStorage.getItem('memeSupremeFormData');
            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    if (parsed.targets) setTargets(parsed.targets);
                    if (parsed.contextDesc) setContextDesc(parsed.contextDesc);
                    if (parsed.selectedTone) setSelectedTone(parsed.selectedTone);
                } catch (e) {
                    console.error("Failed to parse local storage form data", e);
                }
            }
            setStep("generating");
            setCurrentSessionId(initialOrderId); // initialOrderId from query param is the session_id
            startGeneration(initialOrderId, true);
        }
    }, [initialOrderId, initialStep]);

    // Used for auto-starting generation right after re-hydration from localStorage
    const startGeneration = async (orderIdToUse: string, isAutoStart = false) => {
        setStep("generating");
        setLoadingMsgIdx(0);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
            const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
            const supabaseUrl = process.env.NEXT_PUBLIC_THERAI_SUPABASE_URL || 'https://wrvqqvqvwqmfdqvqmaar.supabase.co';

            if (!anonKey) throw new Error("Missing NEXT_PUBLIC_THERAI_ANON_KEY in .env.local");

            const client = createClient(supabaseUrl, anonKey);
            supabaseClientRef.current = client;

            // If autoStart, we need to read from localStorage just in case state hasn't flushed
            let reqTargets = targets;
            let reqContext = contextDesc;
            let reqTone = selectedTone;

            if (isAutoStart) {
                const savedData = localStorage.getItem('memeSupremeFormData');
                if (savedData) {
                    try {
                        const parsed = JSON.parse(savedData);
                        reqTargets = parsed.targets || targets;
                        reqContext = parsed.contextDesc || contextDesc;
                        reqTone = parsed.selectedTone || selectedTone;
                    } catch (e) { }
                }
                localStorage.removeItem('memeSupremeFormData'); // clear it
            }

            const res = await fetch(`${apiUrl}/memeroast-worker`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`
                },
                body: JSON.stringify({
                    session_id: orderIdToUse,
                    product_type: 'memesupreme-roast',
                    target_names: reqTargets.map(t => t.name).filter(Boolean).join(", "),
                    context_description: reqContext,
                    tone: reqTone.toLowerCase(),
                    optional_date: reqTargets.filter(t => t.date).map(t => `${t.name || 'Target'}: ${t.date || 'Unknown Date'}`).join(" | "),
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
            if (!data.success) throw new Error(data.error || 'Failed to dispatch generation task');

        } catch (e) {
            console.error('Failed to dispatch generation task:', e);
            setErrorMsg(e instanceof Error ? e.message : 'Unknown error occurred');
            setStep("result");
        }
    };

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
            }, 10000);
        }
        return () => {
            clearInterval(msgInterval);
            clearTimeout(btnTimeout);
        };
    }, [step]);

    const handleCheckout = async (product_type: string) => {
        setIsCheckingOut(true);
        // Save form state
        localStorage.setItem('memeSupremeFormData', JSON.stringify({ targets, contextDesc, selectedTone }));

        try {
            const apiUrl = process.env.NEXT_PUBLIC_THERAI_API_URL || 'http://localhost:54321/functions/v1';
            const anonKey = process.env.NEXT_PUBLIC_THERAI_ANON_KEY || '';
            const sid = getSessionId();

            const response = await fetch(`${apiUrl}/memesupreme-create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`
                },
                body: JSON.stringify({
                    product_type: product_type,
                    session_id: sid
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
    };

    const handleGenerateClick = () => {
        if (credits !== null && credits > 0) {
            const sid = getSessionId();
            setCurrentSessionId(sid);
            startGeneration(sid);
        } else {
            setShowPurchaseModal(true);
        }
    };

    const handleBypassPay = () => {
        localStorage.setItem('memeSupremeFormData', JSON.stringify({ targets, contextDesc, selectedTone }));
        const testId = `test-${crypto.randomUUID()}`;
        setCurrentSessionId(testId);
        startGeneration(testId, true);
    };

    const handleMemeReady = async () => {
        if (!currentSessionId || !supabaseClientRef.current) return;
        setIsPolling(true);
        let attempts = 0;

        const poll = async () => {
            attempts++;
            try {
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

                    addMeme({
                        id: currentSessionId,
                        url: data.image_url,
                        tone: selectedTone.toUpperCase(),
                        targets: targets.map(t => t.name).filter(Boolean).join(", "),
                        timestamp: Date.now()
                    });

                    setTimeout(() => forceDownload(data.image_url), 500);
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
                setStep("result"); // This was the line where the incorrect CSS was injected. Corrected to "result".
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

    const resetForm = () => {
        setStep("details");
        setTargets([{ name: "", date: "" }]);
        setContextDesc("");
        setSelectedTone("Roast");
        setGeneratedImage(null);
        setErrorMsg(null);
        setCurrentSessionId(null);
        setIsMemeReadyBtnVisible(false);
        setIsPolling(false);

        // Refresh credits on form reset
        const sid = getSessionId();
        if (supabaseClientRef.current) {
            supabaseClientRef.current
                .from('memesupreme_credits')
                .select('credits_remaining')
                .eq('session_id', sid)
                .single()
                .then(({ data }) => setCredits(data ? data.credits_remaining : 0));
        }
    };

    return (
        <div className={styles.container} data-step={step}>
            {step === "details" && (
                <div className={styles.content}>
                    <div className={styles.headerBox}>
                        <Image
                            src="/assets/logo_white.png"
                            alt="Meme Supreme Icon"
                            width={32}
                            height={32}
                            onClick={() => {
                                if (process.env.NODE_ENV === 'development' && targets.some(t => t.name) && contextDesc) {
                                    handleBypassPay();
                                }
                            }}
                            style={{ cursor: process.env.NODE_ENV === 'development' ? 'pointer' : 'default' }}
                        />
                        <h2 className={styles.title}>Explain the chaos. We&apos;ll meme it.</h2>
                    </div>

                    <div className={styles.form}>
                        <div className={styles.inputGroup}>
                            <div className={styles.labelsRow}>
                                <label className={styles.flexLabel}>Name :</label>
                                <div className={styles.flexLabelRight}>
                                    <label className={styles.hintLabel}>
                                        Optional
                                        <button type="button" onClick={() => setShowHint(!showHint)} className={styles.hintButton}>
                                            Hint ✨
                                        </button>
                                    </label>
                                    {showHint && (
                                        <div className={styles.hintTooltip}>
                                            <p className={styles.hintTooltipTitle}>Birthday (optional)</p>
                                            <p className={styles.hintTooltipText}>We use this to add astrology insights to your meme.</p>
                                        </div>
                                    )}
                                </div>
                                {targets.length > 1 && <div className={styles.emptySpacer}></div>}
                            </div>

                            {targets.map((target, idx) => (
                                <div key={idx} className={styles.targetRow}>
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={target.name}
                                        onChange={(e) => {
                                            const newTargets = [...targets];
                                            newTargets[idx].name = e.target.value;
                                            setTargets(newTargets);
                                        }}
                                        className={styles.targetInput}
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
                                        className={styles.targetInput}
                                    />

                                    {targets.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setTargets(targets.filter((_, i) => i !== idx))}
                                            className={styles.removeTargetBtn}
                                            title="Remove"
                                        >×</button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => setTargets([...targets, { name: "", date: "" }])}
                                className={styles.addTargetBtn}
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

                        <div className={styles.actionBox}>
                            <button
                                className={styles.primaryButton}
                                disabled={!targets.some(t => t.name) || !contextDesc || isCheckingOut || credits === null}
                                onClick={handleGenerateClick}
                            >
                                {isCheckingOut ? "Loading..." : (
                                    credits !== null && credits > 0
                                        ? `Generate Meme • ${credits} Left`
                                        : "Generate Meme"
                                )}
                            </button>

                            {process.env.NODE_ENV === 'development' && (
                                <p className={styles.fineprint}>Secure checkout powered by Stripe. Apple Pay & Google Pay supported.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Purchase Modal overlay */}
            {showPurchaseModal && (
                <div className={styles.purchaseModalOverlay} onClick={() => setShowPurchaseModal(false)}>
                    <div className={styles.purchaseModalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.purchaseModalClose} onClick={() => setShowPurchaseModal(false)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>

                        <div className={styles.purchaseModalHeader}>
                            <h3 className={styles.purchaseModalTitle}>Choose your meme pack</h3>
                            <p className={styles.purchaseModalSubtitle}>Fuel the chaos. No subscription required.</p>
                        </div>

                        <div className={styles.packOptions}>
                            <div
                                className={styles.packCard}
                                onClick={() => handleCheckout('memesupreme-pack-5')}
                            >
                                <h4 className={styles.packName}>Starter Pack</h4>
                                <div className={styles.packDetails}>
                                    <span className={styles.packCount}>5 memes</span>
                                    <span className={styles.packPrice}>• $3</span>
                                </div>
                            </div>

                            <div
                                className={`${styles.packCard} ${styles.packCardPremium}`}
                                onClick={() => handleCheckout('memesupreme-pack-20')}
                            >
                                <div className={styles.premiumBadge}>Best Value</div>
                                <h4 className={styles.packName}>Creator Pack</h4>
                                <div className={styles.packDetails}>
                                    <span className={styles.packCount}>20 memes</span>
                                    <span className={styles.packPrice}>• $10</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === "generating" && (
                <div className={`${styles.content} ${styles.centerContent}`}>
                    {!isMemeReadyBtnVisible && (
                        <div className={styles.spinner}></div>
                    )}
                    <h2 className={`${styles.generationTitle} ${!isMemeReadyBtnVisible ? styles.pulsingText : ''}`}>
                        {!isMemeReadyBtnVisible ? LOADING_MESSAGES[loadingMsgIdx] : "Generation Cycle Complete"}
                    </h2>

                    {isMemeReadyBtnVisible && (
                        <div className={styles.readyBox}>
                            <button
                                onClick={handleMemeReady}
                                className={styles.primaryButton}
                                disabled={isPolling}
                            >
                                {isPolling ? 'Checking...' : 'View Meme'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {step === "result" && (
                <div className={styles.resultContent}>
                    {errorMsg ? (
                        <div className={styles.errorBox}>
                            <h2 className={styles.generationTitle}>Woops!</h2>
                            <p className={styles.errorText}>{errorMsg}</p>
                            {errorMsg.includes("not allowed") && (
                                <div className={styles.errorTerms}>
                                    <a href="/terms">Read Terms & Policies</a>
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
                                >Check now</button>
                            ) : (
                                <button className={styles.secondaryButton} onClick={resetForm}>
                                    Try Again
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className={styles.resultImageContainer}>
                                {generatedImage && (
                                    <Image src={generatedImage} alt="Generated Roast Meme" fill className={styles.resultImage} unoptimized={true} />
                                )}
                            </div>

                            <div className={styles.floatingActions}>
                                {generatedImage && (
                                    <button onClick={() => forceDownload(generatedImage)} className={styles.iconButton} disabled={isDownloading} aria-label="Download Image" style={{ opacity: isDownloading ? 0.7 : 1 }}>
                                        {isDownloading ? (
                                            <div className={styles.spinner} style={{ width: 24, height: 24, borderWidth: 2, marginBottom: 0 }}></div>
                                        ) : (
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                        )}
                                    </button>
                                )}
                                <button className={styles.iconButton} onClick={resetForm} aria-label="Close and Create Another">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
