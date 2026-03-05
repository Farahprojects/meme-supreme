import React from 'react';
import Header from '@/components/Header';
import Link from 'next/link';
import styles from './page.module.css';

export default function TermsAndPolicies() {
    return (
        <div className={styles.pageContainer}>
            <Header />

            <main className={styles.mainContent}>
                <div>
                    <Link href="/" className={styles.backLink}>
                        <span>←</span> Back to Home
                    </Link>
                    <h1 className={styles.pageTitle}>
                        Terms <span className="text-gradient">& Policies</span>
                    </h1>
                    <p className={styles.subtitle}>The rules of the roast. Read 'em and weep.</p>
                </div>

                <div className={styles.termsCard}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.sectionNumber}>01.</span> Allowed Content (Set the Tone)
                        </h2>
                        <div className={styles.sectionText}>
                            <p>
                                Meme Supreme allows users to generate humorous, satirical, and creative memes based on text descriptions.
                                The service is intended for entertainment purposes and responsible use.
                            </p>
                        </div>
                    </section>

                    <div className={styles.divider} />

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.sectionNumber}>02.</span> Prohibited Content
                        </h2>
                        <div className={styles.sectionText}>
                            <p>To ensure a safe environment, the following categories of content are strictly prohibited from our platform:</p>

                            <div className={styles.prohibitedBox}>
                                <ul className={styles.prohibitedList}>
                                    {[
                                        { title: 'Illegal or Harmful Content', desc: 'Violence or threats toward individuals or groups, or encouraging illegal activity.' },
                                        { title: 'Harassment or Bullying', desc: 'Targeted attacks or abuse of any kind.' },
                                        { title: 'Hate or Discrimination', desc: 'Content targeting race, ethnicity, religion, gender, sexual orientation, or disability.' },
                                        { title: 'Explicit Content', desc: 'Pornographic or explicit sexual material.' },
                                        { title: 'Targeted Political Messaging', desc: 'Memes designed to influence political opinions about real individuals, candidates, or elections.' },
                                        { title: 'Defamation or Personal Attacks', desc: 'False statements presented as fact about real individuals.' },
                                        { title: 'Misuse of Real People', desc: 'Content impersonating or misleadingly representing real individuals in compromising situations.' }
                                    ].map((item, i) => (
                                        <li key={i} className={styles.prohibitedItem}>
                                            <div className={styles.crossIcon}>✕</div>
                                            <div>
                                                <strong style={{ color: "white", display: "block", marginBottom: "4px" }}>{item.title}</strong>
                                                <span>{item.desc}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>

                    <div className={styles.divider} />

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.sectionNumber}>03.</span> AI Provider Limitations
                        </h2>
                        <p className={styles.sectionText}>
                            Meme generation relies on third-party artificial intelligence providers. Content may be automatically rejected
                            if it violates the safety policies of those providers. These systems operate independently, and we cannot
                            override their moderation decisions.
                        </p>
                    </section>

                    <div className={styles.divider} />

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.sectionNumber}>04.</span> Right to Refuse Generation
                        </h2>
                        <p className={styles.sectionText}>
                            We reserve the right to refuse or remove generated content that violates these terms or applicable platform policies.
                        </p>
                    </section>

                    <div className={styles.divider} />

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.sectionNumber}>05.</span> No Guarantee of Generation
                        </h2>
                        <p className={styles.sectionText}>
                            Submission of a prompt does not guarantee that content will be generated. Prompts that violate safety policies
                            may be rejected without output.
                            <span className={styles.highlightText}>Keep it funny, keep it clean.</span>
                        </p>
                    </section>
                </div>
            </main>

            <footer className={styles.footer}>
                <p>© {new Date().getFullYear()} MemeSupreme. All rights reserved. No refunds for hurt feelings.</p>
            </footer>
        </div>
    );
}
