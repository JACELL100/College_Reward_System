import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description =
  "CampusCoin: an ERC20 reward-point DApp for Fr. Conceicao Rodrigues College of Engineering. Earn, transfer and redeem College Reward Points (CRP) on Ethereum Sepolia with MetaMask.";

export const metadata: Metadata = {
  title: { default: "CampusCoin · College Reward Points", template: "%s · CampusCoin" },
  description,
  applicationName: "CampusCoin",
  keywords: ["ERC20", "Ethereum", "Sepolia", "MetaMask", "DApp", "FRCRCE", "reward points"],
  openGraph: {
    title: "CampusCoin · College Reward Points",
    description,
    type: "website",
    siteName: "CampusCoin",
  },
  twitter: { card: "summary", title: "CampusCoin · College Reward Points", description },
};

export const viewport: Viewport = {
  themeColor: "#07080b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
