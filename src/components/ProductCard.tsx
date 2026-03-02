"use client";

import Image from "next/image";
import styles from "./ProductCard.module.css";

interface ProductCardProps {
    title: string;
    description: string;
    price: string;
    previewUrl: string;
    onSelect: () => void;
}

export default function ProductCard({ title, description, price, previewUrl, onSelect }: ProductCardProps) {
    return (
        <div className={styles.card}>
            <div className={styles.imageContainer}>
                <Image
                    src={previewUrl}
                    alt={title}
                    fill
                    className={styles.image}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className={styles.priceTag}>{price}</div>
            </div>

            <div className={styles.content}>
                <h3 className={styles.title}>{title}</h3>
                <p className={styles.description}>{description}</p>

                <button className={styles.button} onClick={onSelect}>
                    Create Meme
                </button>
            </div>
        </div>
    );
}
