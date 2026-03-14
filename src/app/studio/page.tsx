"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import styles from "./page.module.css";

// Modular Hooks
import { useStudioForm } from "./hooks/useStudioForm";
import { useStudioHistory } from "./hooks/useStudioHistory";
import { useStudioImages } from "./hooks/useStudioImages";
import { useStudioCarousel } from "./hooks/useStudioCarousel";
import { useStudioReels } from "./hooks/useStudioReels";

// Modular Components
import { StudioUsageBar } from "./components/StudioUsageBar";
import { StudioHeader } from "./components/StudioHeader";
import { StudioForm } from "./components/StudioForm";
import { ImageStudio } from "./components/ImageStudio";
import { CarouselStudio } from "./components/CarouselStudio";
import { ReelStudio } from "./components/ReelStudio";
import { StudioHistory } from "./components/StudioHistory";

export default function StudioPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const subscription = useSubscription();

    // 1. Initialize modular state hooks
    const form = useStudioForm();
    const history = useStudioHistory(user);
    
    const images = useStudioImages(
        user, form.targetNames, form.context, form.optionalDate, form.selectedTones,
        form.setIsGenerating, form.setHasGenerated,
        history.fetchHistory, history.persistEditedImage
    );

    const carousel = useStudioCarousel(user, form.context, history.fetchHistory);
    const reels = useStudioReels(user, form.context);

    // 2. Auth protection
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace("/");
            return;
        }
    }, [user, authLoading, router]);

    if (authLoading || !user || subscription.loading) {
        return (
            <div className={styles.wrap}>
                <div className={styles.loading}>Loading…</div>
            </div>
        );
    }

    // 3. Subscription Gating
    if (!subscription.isSubscribed) {
        return (
            <div className={styles.wrap}>
                <div className={styles.gateWrap}>
                    <div className={styles.gateLock}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <h2 className={styles.gateTitle}>Studio is a Starter feature</h2>
                    <p className={styles.gateSub}>Subscribe to unlock AI-powered meme generation.</p>
                    <ul className={styles.gateFeatures}>
                        <li>48 images / month across all 4 tones</li>
                        <li>5 AI-scripted reels / month (Beta)</li>
                        <li>Unlimited tweaks, edits &amp; caption rewrites</li>
                        <li>No watermark on generated images</li>
                    </ul>
                    <a href="/pricing" className={styles.gateBtn}>
                        See Plans — from $19/mo
                    </a>
                </div>
            </div>
        );
    }

    const periodEndLabel = subscription.periodEnd
        ? subscription.periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : null;

    const imageAtLimit = subscription.imagesUsed >= subscription.imagesLimit;
    const reelAtLimit = subscription.reelsUsed >= subscription.reelsLimit;
    const carouselAtLimit = subscription.imagesUsed + 6 > subscription.imagesLimit;

    // 4. Render Layout
    return (
        <div className={styles.wrap}>
            <StudioUsageBar 
                imagesUsed={subscription.imagesUsed} imagesLimit={subscription.imagesLimit}
                reelsUsed={subscription.reelsUsed} reelsLimit={subscription.reelsLimit}
                periodEndLabel={periodEndLabel}
            />

            <StudioHeader />

            <StudioForm 
                studioMode={form.studioMode} setStudioMode={form.setStudioMode}
                targetNames={form.targetNames} setTargetNames={form.setTargetNames}
                context={form.context} setContext={form.setContext}
                
                // Mode-specific props
                carouselFormat={carousel.carouselFormat} setCarouselFormat={carousel.setCarouselFormat}
                carouselTone={carousel.carouselTone} setCarouselTone={carousel.setCarouselTone}
                
                reelGoal={reels.reelGoal} setReelGoal={reels.setReelGoal}
                reelLength={reels.reelLength} setReelLength={reels.setReelLength}
                reelRefPreviews={reels.reelRefPreviews}
                removeReelRefImage={reels.removeReelRefImage}
                addReelRefImage={reels.addReelRefImage}
                reelScript={reels.reelScript} setReelScript={reels.setReelScript}
                reelScriptStatus={reels.reelScriptStatus}
                handleWriteScript={reels.handleWriteScript}
                
                selectedTones={form.selectedTones}
                toggleTone={form.toggleTone}
                setSelectedTones={form.setSelectedTones}
            />

            {form.studioMode === "images" && (
                <ImageStudio 
                    hasGenerated={form.hasGenerated} isGenerating={form.isGenerating}
                    results={images.results} selectedTones={form.selectedTones}
                    handleRegenerate={images.handleRegenerate}
                    handleDownload={history.handleDownload}
                    handleSaveTextStyle={history.handleSaveTextStyle}
                    handleEditImage={images.handleEditImage}
                    handleCaptionChange={images.handleCaptionChange}
                    handleNamesChange={images.handleNamesChange}
                    onGenerate={() => images.handleGenerate(subscription.isSubscribed, subscription.imagesUsed, subscription.imagesLimit)}
                    imageAtLimit={imageAtLimit}
                    periodEndLabel={periodEndLabel}
                />
            )}

            {form.studioMode === "carousel" && (
                <CarouselStudio 
                    carouselGenerating={carousel.carouselGenerating}
                    carouselError={carousel.carouselError}
                    carouselResult={carousel.carouselResult}
                    handleCreateCarousel={() => carousel.handleCreateCarousel(subscription.isSubscribed, subscription.imagesUsed, subscription.imagesLimit)}
                    handleDownloadSlide={carousel.handleDownloadSlide}
                    carouselAtLimit={carouselAtLimit}
                    periodEndLabel={periodEndLabel}
                />
            )}

            {form.studioMode === "reels" && (
                <ReelStudio 
                    reelStatus={reels.reelStatus}
                    reelPhase={reels.reelPhase}
                    reelError={reels.reelError}
                    reelVideoUrl={reels.reelVideoUrl}
                    reelScriptStatus={reels.reelScriptStatus}
                    handleCreateReel={() => reels.handleCreateReel(subscription.isSubscribed, subscription.reelsUsed, subscription.reelsLimit)}
                    reelAtLimit={reelAtLimit}
                    periodEndLabel={periodEndLabel}
                    hasValidScript={!!reels.reelScript?.scenes?.[0]?.trim()}
                />
            )}

            <StudioHistory 
                history={history.history}
                historyFetching={history.historyFetching}
                historyLoadingIds={history.historyLoadingIds}
                showAllHistory={history.showAllHistory}
                setShowAllHistory={history.setShowAllHistory}
                handleDownload={history.handleDownload}
                handleSaveTextStyle={history.handleSaveTextStyle}
                handleHistoryRegenerate={history.handleHistoryRegenerate}
                handleHistoryEditImage={history.handleHistoryEditImage}
            />
        </div>
    );
}
