import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How CampusCoin works on-chain: architecture, Ethereum building blocks, the ERC20 functions used, and a live read of the CRP contract on Sepolia.",
};

export default function AboutPage() {
  return <AboutContent />;
}
