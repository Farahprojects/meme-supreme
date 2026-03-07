"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const router = useRouter();
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSocialSignIn = async (provider: 'google' | 'apple') => {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });
                if (error) throw error;
                setSuccess("Success! Redirecting...");
                setTimeout(() => {
                    onClose();
                    router.push("/dashboard");
                }, 1500);
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onClose();
                router.push("/dashboard");
            }
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.close} onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <h2 className={styles.title}>{isSignUp ? "Join Supreme" : "Welcome Back"}</h2>
                <p className={styles.subtitle}>
                    {isSignUp ? "Create an account to save your memes to the cloud." : "Sign in to access your vault from any device."}
                </p>

                {error && <div className={styles.error}>{error}</div>}
                {success && <div className={styles.success}>{success}</div>}

                <form className={styles.form} onSubmit={handleSubmit}>
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
                        <input
                            type="password"
                            placeholder="••••••••"
                            className={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button className={styles.submitBtn} disabled={loading}>
                        {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
                    </button>
                </form>

                <div className={styles.divider}>or</div>

                <div className={styles.socialButtons}>
                    <button className={styles.socialBtn} onClick={() => handleSocialSignIn('google')} disabled={loading}>
                        <svg className={styles.socialIcon} viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z" />
                            <path fill="#34A853" d="M16.04 18.013c-1.09.693-2.459 1.077-4.04 1.077a7.077 7.077 0 0 1-6.734-4.856L1.24 17.35C3.198 21.302 7.27 24 12 24c2.93 0 5.735-1.043 7.834-3l-3.793-2.987Z" />
                            <path fill="#4A90E2" d="M19.834 21c2.193-2.04 3.416-5.464 3.416-9 0-.64-.09-1.298-.26-1.954l-11.026-.008L12 14.536h6.582c-.31 1.487-1.11 2.73-2.54 3.477l3.792 2.987Z" />
                            <path fill="#FBBC05" d="M5.266 14.235a7.077 7.077 0 0 1 0-4.47L1.24 6.65a11.96 11.96 0 0 0 0 10.7l4.026-3.115Z" />
                        </svg>
                        {isSignUp ? "Continue with Google" : "Sign in with Google"}
                    </button>
                    <button className={styles.socialBtn} onClick={() => handleSocialSignIn('apple')} disabled={loading}>
                        <svg className={styles.socialIcon} viewBox="0 0 24 24">
                            <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05 1.72-3.26 1.72-1.16 0-1.54-.72-2.95-.72-1.42 0-1.87.7-2.95.72-1.19.02-2.38-.85-3.41-2.32-2.11-3.03-1.62-7.82.97-10.77 1.28-1.47 2.8-2.38 4.45-2.4 1.25-.03 2.45.83 3.21.83.76 0 2.21-.99 3.73-.84 1.5.06 2.67.61 3.43 1.71-3.13 1.83-2.61 6.01.5 7.42-1.11 1.63-2.55 3.25-4.12 4.7l.4.01v.01ZM14.15 4.3c-1.78.22-3.12 1.62-2.8 3.32 1.78-.22 2.93-1.61 2.8-3.32h0Z" />
                        </svg>
                        {isSignUp ? "Continue with Apple" : "Sign in with Apple"}
                    </button>
                </div>

                <div className={styles.toggle}>
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}
                    <button className={styles.toggleBtn} onClick={() => setIsSignUp(!isSignUp)}>
                        {isSignUp ? "Sign In" : "Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}
