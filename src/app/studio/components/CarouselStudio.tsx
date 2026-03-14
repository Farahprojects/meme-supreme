import styles from "../page.module.css";
import { CarouselResult } from "../types";

interface CarouselStudioProps {
    carouselGenerating: boolean;
    carouselError: string | null;
    carouselResult: CarouselResult | null;
    handleCreateCarousel: () => void;
    handleDownloadSlide: (url: string, filename: string) => Promise<void>;
    carouselAtLimit: boolean;
    periodEndLabel: string | null;
}

export function CarouselStudio({
    carouselGenerating, carouselError, carouselResult,
    handleCreateCarousel, handleDownloadSlide,
    carouselAtLimit, periodEndLabel
}: CarouselStudioProps) {
    return (
        <>
            {carouselAtLimit && (
                <p className={styles.limitMsg}>
                    You need 6 free image slots for a carousel.
                    {periodEndLabel && ` Resets on ${periodEndLabel}.`}
                </p>
            )}
            <button
                type="button"
                className={styles.generateBtn}
                onClick={handleCreateCarousel}
                disabled={carouselGenerating || carouselAtLimit}
            >
                {carouselGenerating ? "Creating…" : "Create"}
            </button>

            {carouselGenerating && (
                <p className={styles.reelProgress}>Creating your carousel… this takes ~30–90s</p>
            )}
            {carouselError && (
                <p className={styles.reelError}>{carouselError}</p>
            )}
            {carouselResult && carouselResult.slides.length > 0 && (
                <section className={styles.resultsSection}>
                    <h2 className={styles.resultsTitle}>Carousel</h2>
                    <div className={styles.grid}>
                        {carouselResult.slides
                            .sort((a, b) => a.slide_index - b.slide_index)
                            .map((slide, idx) => (
                                <article key={slide.slide_index} className={styles.carouselSlide}>
                                    <a
                                        href={slide.image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.carouselSlideLink}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={slide.image_url} alt={`Slide ${idx + 1}`} className={styles.carouselSlideImg} />
                                    </a>
                                    <p className={styles.carouselSlideText}>{slide.slide_text}</p>
                                    <button
                                        type="button"
                                        className={styles.carouselDownloadBtn}
                                        onClick={() => handleDownloadSlide(slide.image_url, `carousel-${idx + 1}.jpg`)}
                                    >
                                        Download
                                    </button>
                                </article>
                            ))}
                    </div>
                </section>
            )}
        </>
    );
}
