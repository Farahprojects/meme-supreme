"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type AuthStep = "email" | "otc";

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const router = useRouter();
    const [step, setStep] = useState<AuthStep>("email");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [otc, setOtc] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Determines if we render "Sign In" or "Sign Up" text for social buttons/headers
    const [isSignUpIntent, setIsSignUpIntent] = useState(false);

    if (!isOpen) return null;

    const handleSocialSignIn = async (provider: 'google' | 'apple') => {
        if (supabase.auth === undefined || process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder')) {
            setError("Supabase is not configured yet. Please add your credentials to .env.local");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message || "Social sign-in failed. Please try again.");
            setLoading(false);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) return;

        if (isSignUpIntent && password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (isSignUpIntent) {
                // Sign Up flow: standard email/password provided, but we send OTC for verification first
                const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/memesupreme-auth`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({ action: "request_otc", email }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to send code.");
                }

                setSuccess("We've sent a 6-digit code to your email.");
                setStep("otc");
            } else {
                // Sign In flow: standard password verification
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (signInError) {
                    // Check if they need verification
                    if (signInError.message.toLowerCase().includes("email not confirmed")) {
                        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/memesupreme-auth`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                            },
                            body: JSON.stringify({ action: "request_otc", email }),
                        });

                        if (res.ok) {
                            setSuccess("Please confirm your email. We've sent a 6-digit code.");
                            setStep("otc");
                            return;
                        }
                    }
                    throw signInError;
                }

                setSuccess("Success! Redirecting...");
                setTimeout(() => {
                    onClose();
                    router.push("/dashboard");
                }, 1000);
            }

        } catch (err: any) {
            let errorMessage = err.message || "Something went wrong. Please try again.";
            if (errorMessage.toLowerCase().includes("invalid login credentials")) {
                errorMessage = "Invalid email or password. If you haven't verified your email yet, please switch to 'Sign Up' to resend the code.";
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleOtcSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!otc || otc.length !== 6) {
            setError("Please enter the 6-digit code.");
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/memesupreme-auth`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ action: "verify_otc", email, token: otc, password }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Invalid code.");
            }

            const data = await res.json();

            // Set the magic session from our Edge Function
            if (data.session) {
                const { error: sessionError } = await supabase.auth.setSession(data.session);
                if (sessionError) throw new Error("Failed to set local session.");

                setSuccess("Success! Redirecting...");
                setTimeout(() => {
                    onClose();
                    router.push("/dashboard");
                }, 1000);
            } else {
                throw new Error("No session returned from server.");
            }

        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setStep("email");
        setOtc("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        setError(null);
        setSuccess(null);
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.close} onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <h2 className={styles.title}>
                    {step === "email" ? (isSignUpIntent ? "Join Supreme" : "Welcome Back") : "Check your email"}
                </h2>
                <p className={styles.subtitle}>
                    {step === "email"
                        ? (isSignUpIntent ? "Create an account to save your memes to the cloud." : "Sign in to access your vault from any device.")
                        : `We sent a 6-digit code to ${email}`
                    }
                </p>

                {error && <div className={styles.error}>{error}</div>}
                {success && <div className={styles.success}>{success}</div>}

                {step === "email" ? (
                    <form className={styles.form} onSubmit={handleEmailSubmit}>
                        <div className={styles.inputGroup}>
                            <label>Email Address</label>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                className={styles.input}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Password</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    className={styles.input}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    className={styles.eyeIcon}
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {isSignUpIntent && (
                            <div className={styles.inputGroup}>
                                <label>Confirm Password</label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        className={styles.input}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        className={styles.eyeIcon}
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        tabIndex={-1}
                                        aria-label="Toggle password visibility"
                                    >
                                        {showConfirmPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button className={styles.submitBtn} disabled={loading || !email || !password || (isSignUpIntent && !confirmPassword)}>
                            {loading ? "Please wait..." : (isSignUpIntent ? "Sign Up" : "Sign In")}
                        </button>
                    </form>
                ) : (
                    <form className={styles.form} onSubmit={handleOtcSubmit}>
                        <div className={styles.inputGroup}>
                            <label>6-Digit Code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="123456"
                                className={styles.input}
                                value={otc}
                                onChange={(e) => setOtc(e.target.value.replace(/\D/g, ''))} // only allow numbers
                                style={{ letterSpacing: '8px', fontSize: '1.2rem', textAlign: 'center', fontWeight: 'bold' }}
                                required
                            />
                        </div>

                        <button className={styles.submitBtn} disabled={loading || otc.length !== 6}>
                            {loading ? "Verifying..." : "Sign In"}
                        </button>

                        <button type="button" className={styles.secondaryBtn} onClick={handleReset} style={{ background: 'transparent', border: 'none', color: '#666', marginTop: '12px', cursor: 'pointer', width: '100%' }}>
                            Use a different email
                        </button>
                    </form>
                )}

                {step === "email" && (
                    <>
                        <div className={styles.divider}>or</div>

                        <div className={styles.socialButtons}>
                            <button className={styles.socialBtn} onClick={() => handleSocialSignIn('google')} disabled={loading}>
                                <svg className={styles.socialIcon} viewBox="0 0 24 24">
                                    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z" />
                                    <path fill="#34A853" d="M16.04 18.013c-1.09.693-2.459 1.077-4.04 1.077a7.077 7.077 0 0 1-6.734-4.856L1.24 17.35C3.198 21.302 7.27 24 12 24c2.93 0 5.735-1.043 7.834-3l-3.793-2.987Z" />
                                    <path fill="#4A90E2" d="M19.834 21c2.193-2.04 3.416-5.464 3.416-9 0-.64-.09-1.298-.26-1.954l-11.026-.008L12 14.536h6.582c-.31 1.487-1.11 2.73-2.54 3.477l3.792 2.987Z" />
                                    <path fill="#FBBC05" d="M5.266 14.235a7.077 7.077 0 0 1 0-4.47L1.24 6.65a11.96 11.96 0 0 0 0 10.7l4.026-3.115Z" />
                                </svg>
                                {isSignUpIntent ? "Continue with Google" : "Sign in with Google"}
                            </button>
                        </div>

                        <div className={styles.toggle}>
                            {isSignUpIntent ? "Already have an account?" : "Don't have an account?"}
                            <button className={styles.toggleBtn} onClick={() => setIsSignUpIntent(!isSignUpIntent)}>
                                {isSignUpIntent ? "Sign In" : "Sign Up"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
