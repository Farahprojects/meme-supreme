import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemeSupreme | Get Roasted",
  description: "AI-generated memes about you, your friends, or your relationship.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
