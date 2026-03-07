import Image from "next/image";
import supabaseLoader from "@/lib/supabase-image-loader";
import styles from "./MemeCard.module.css";

interface MemeCardProps {
    imageUrl: string;
    type: string;
    alt: string;
    priority?: boolean;
}

export default function MemeCard({ imageUrl, type, alt, priority = false }: MemeCardProps) {
    return (
        <div className={styles.card}>
            <div className={styles.imageWrapper}>
                <Image
                    src={imageUrl}
                    alt={alt}
                    fill
                    className={styles.image}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    priority={priority}
                    loader={supabaseLoader}
                />
            </div>
            <div className={styles.labelContainer}>
                <span className={styles.label}>{type}</span>
            </div>
        </div>
    );
}
