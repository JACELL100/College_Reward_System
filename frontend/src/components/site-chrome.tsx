"use client";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/components/providers/auth-provider";
import { ButtonLink } from "@/components/ui/button";
import { CONTRACT_ADDRESS, explorerAddr } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import { shortAddr } from "@/lib/utils";

export function SiteHeader() {
  const { session, ready } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Site">
          <Link href="/#how" className="hover:text-fg">
            How it works
          </Link>
          <Link href="/#stack" className="hover:text-fg">
            Architecture
          </Link>
          <Link href="/about" className="hover:text-fg">
            On-chain
          </Link>
        </nav>
        <div className="flex-1" />
        {ready && session ? (
          <ButtonLink href="/dashboard" size="sm">
            Open app <ArrowRight className="size-3.5" />
          </ButtonLink>
        ) : (
          <ButtonLink href="/login" size="sm" variant="secondary">
            Sign in
          </ButtonLink>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-subtle">
            College Reward Points (CRP) for Fr. Conceicao Rodrigues College of Engineering, Bandra. A Blockchain
            Development (HBCC701) prototype on the Ethereum Sepolia testnet. Tokens have no monetary value.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <Link href="/about" className="hover:text-fg">
            How it works
          </Link>
          <Link href="/login" className="hover:text-fg">
            Sign in
          </Link>
          {isContractConfigured && (
            <a
              href={explorerAddr(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono hover:text-fg"
            >
              {shortAddr(CONTRACT_ADDRESS)} <ExternalLink className="size-3" />
            </a>
          )}
          <span className="text-subtle">© {new Date().getFullYear()} FRCRCE</span>
        </div>
      </div>
    </footer>
  );
}
