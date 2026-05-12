import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { AppNotificationListeners } from "@/components/AppNotificationListeners";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Tombola — On-Chain Solana Raffles",
  description:
    "Trustless parimutuel raffles on Solana. Buy tickets in SOL; verifiable random draws via Switchboard On-Demand; 99.5% winner share.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${spaceMono.variable} font-display antialiased min-h-screen`}
      >
        <WalletProviders>
          <AppNotificationListeners />
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}
