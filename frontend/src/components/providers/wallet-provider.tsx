"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, type JsonRpcSigner } from "ethers";
import { toast } from "sonner";
import {
  CHAIN_ID,
  CHAIN_ID_HEX,
  CONTRACT_ADDRESS,
  CRP_ABI,
  SEPOLIA_PARAMS,
  decodeTxError,
  explorerTx,
  readCrpBalance,
  readProvider,
} from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import { api, errMsg } from "@/lib/api";
import type { TxRecordResult } from "@/lib/types";

export interface Eip1193 {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
}

export interface SendTxOptions {
  method: string;
  args: unknown[];
  label: string; // e.g. "Transfer 50 CRP"
  categoryId?: number | null;
  note?: string | null;
  record?: boolean;
}

export interface SendTxResult {
  hash: string;
  record: TxRecordResult | null;
}

interface WalletCtx {
  hydrated: boolean;
  installed: boolean;
  walletName: string | null;
  isMobile: boolean;
  deepLink: string;
  address: string | null; // lowercase
  chainId: number | null;
  isCorrectChain: boolean;
  connecting: boolean;
  ethBalance: bigint | null;
  crpBalance: bigint | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  switchChain: () => Promise<boolean>;
  watchAsset: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  getSigner: () => Promise<JsonRpcSigner>;
  signMessage: (message: string) => Promise<string>;
  sendContractTx: (o: SendTxOptions) => Promise<SendTxResult | null>;
}

const Ctx = createContext<WalletCtx | null>(null);
const DISCONNECT_KEY = "crp.wallet.disconnected";

function safeLS(fn: () => void) {
  try {
    fn();
  } catch {
    /* ignore */
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [provider, setProvider] = useState<Eip1193 | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [crpBalance, setCrpBalance] = useState<bigint | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [deepLink, setDeepLink] = useState("https://metamask.io/download/");
  const addrRef = useRef<string | null>(null);
  useEffect(() => {
    addrRef.current = address;
  }, [address]);

  /* ---------------- Provider discovery (EIP-6963 + fallback) ---------------- */
  useEffect(() => {
    const found: Eip6963Detail[] = [];
    const pick = () => {
      const mm = found.find((d) => d.info.rdns === "io.metamask") ?? found.find((d) => d.info.rdns?.startsWith("io.metamask"));
      const chosen = mm ?? found[0];
      if (chosen) {
        setProvider(chosen.provider);
        setWalletName(chosen.info.name);
      } else {
        const eth = (window as unknown as { ethereum?: Eip1193 & { providers?: Eip1193[] } }).ethereum;
        if (eth) {
          const mmLegacy = eth.providers?.find((p) => p.isMetaMask) ?? eth;
          setProvider(mmLegacy);
          setWalletName(mmLegacy.isMetaMask ? "MetaMask" : "Browser wallet");
        }
      }
    };
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Eip6963Detail>).detail;
      if (d?.provider && !found.some((f) => f.info.uuid === d.info.uuid)) {
        found.push(d);
        pick();
      }
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      pick();
      setHydrated(true);
    }, 400);
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    setDeepLink(`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`);
    return () => {
      clearTimeout(t);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  /* ---------------- Balances ---------------- */
  const refreshBalances = useCallback(async () => {
    const a = addrRef.current;
    if (!a) {
      setEthBalance(null);
      setCrpBalance(null);
      return;
    }
    try {
      const [eth, crp] = await Promise.all([
        readProvider().getBalance(a),
        isContractConfigured ? readCrpBalance(a) : Promise.resolve(null),
      ]);
      if (addrRef.current === a) {
        setEthBalance(eth);
        setCrpBalance(crp);
      }
    } catch {
      /* RPC hiccup: keep last known */
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    void refreshBalances();
    const id = setInterval(() => void refreshBalances(), 15_000);
    return () => clearInterval(id);
  }, [address, refreshBalances]);

  /* ---------------- Auto-reconnect + events ---------------- */
  useEffect(() => {
    if (!provider) return;
    let disconnected = false;
    safeLS(() => {
      disconnected = localStorage.getItem(DISCONNECT_KEY) === "1";
    });
    if (!disconnected) {
      provider
        .request({ method: "eth_accounts" })
        .then((accs) => {
          const list = accs as string[];
          if (list?.[0]) setAddress(list[0].toLowerCase());
        })
        .catch(() => {});
    }
    provider
      .request({ method: "eth_chainId" })
      .then((c) => setChainId(parseInt(String(c), 16)))
      .catch(() => {});

    const onAccounts = (...args: unknown[]) => {
      const list = args[0] as string[];
      setAddress(list?.[0] ? list[0].toLowerCase() : null);
      if (!list?.[0]) {
        setEthBalance(null);
        setCrpBalance(null);
      }
    };
    const onChain = (...args: unknown[]) => setChainId(parseInt(String(args[0]), 16));
    const onDisconnect = () => setAddress(null);
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider]);

  /* ---------------- Actions ---------------- */
  const connect = useCallback(async () => {
    if (!provider) {
      if (isMobile) window.location.href = deepLink;
      else window.open("https://metamask.io/download/", "_blank", "noopener");
      return null;
    }
    setConnecting(true);
    try {
      const accs = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const a = accs?.[0]?.toLowerCase() ?? null;
      addrRef.current = a;
      setAddress(a);
      safeLS(() => localStorage.removeItem(DISCONNECT_KEY));
      const c = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(c, 16));
      if (a) toast.success("Wallet connected", { description: `${a.slice(0, 6)}…${a.slice(-4)}` });
      return a;
    } catch (e) {
      toast.error(decodeTxError(e));
      return null;
    } finally {
      setConnecting(false);
    }
  }, [provider, isMobile, deepLink]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setEthBalance(null);
    setCrpBalance(null);
    safeLS(() => localStorage.setItem(DISCONNECT_KEY, "1"));
    provider
      ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
      .catch(() => {});
  }, [provider]);

  const switchChain = useCallback(async () => {
    if (!provider) return false;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
      setChainId(CHAIN_ID);
      return true;
    } catch (e) {
      const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code;
      const orig = (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code;
      if (code === 4902 || orig === 4902 || code === -32603) {
        try {
          await provider.request({ method: "wallet_addEthereumChain", params: [SEPOLIA_PARAMS] });
          setChainId(CHAIN_ID);
          return true;
        } catch (e2) {
          toast.error(decodeTxError(e2));
          return false;
        }
      }
      toast.error(decodeTxError(e));
      return false;
    }
  }, [provider]);

  const watchAsset = useCallback(async () => {
    if (!provider || !isContractConfigured) return;
    try {
      const ok = await provider.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: CONTRACT_ADDRESS, symbol: "CRP", decimals: 0 } },
      });
      if (ok) toast.success("CRP added to MetaMask");
    } catch (e) {
      toast.error(decodeTxError(e));
    }
  }, [provider]);

  const getSigner = useCallback(async () => {
    if (!provider) throw new Error("MetaMask not detected");
    const bp = new BrowserProvider(provider as never, "any");
    return bp.getSigner(addrRef.current ?? undefined);
  }, [provider]);

  const signMessage = useCallback(
    async (message: string) => {
      const signer = await getSigner();
      return signer.signMessage(message);
    },
    [getSigner],
  );

  const sendContractTx = useCallback(
    async (o: SendTxOptions): Promise<SendTxResult | null> => {
      if (!isContractConfigured) {
        toast.error("Contract not configured", { description: "Set NEXT_PUBLIC_CONTRACT_ADDRESS." });
        return null;
      }
      let a = addrRef.current;
      if (!a) a = await connect();
      if (!a || !provider) return null;
      const current = parseInt(String(await provider.request({ method: "eth_chainId" })), 16);
      if (current !== CHAIN_ID) {
        const ok = await switchChain();
        if (!ok) return null;
      }
      const id = toast.loading(`${o.label}`, { description: "Confirm the transaction in MetaMask…" });
      let hash = "";
      try {
        const signer = await getSigner();
        const contract = new Contract(CONTRACT_ADDRESS, CRP_ABI, signer);
        const fn = contract.getFunction(o.method);
        const tx = await fn(...o.args);
        hash = tx.hash as string;
        toast.loading(`${o.label}`, {
          id,
          description: "Pending on Sepolia… usually ~12 s",
          action: { label: "Etherscan", onClick: () => window.open(explorerTx(hash), "_blank", "noopener") },
        });
        const receipt = await tx.wait(1);
        if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted on-chain");
        toast.success(`${o.label} confirmed`, {
          id,
          description: `Block #${receipt.blockNumber}`,
          action: { label: "View tx", onClick: () => window.open(explorerTx(hash), "_blank", "noopener") },
        });
      } catch (e) {
        toast.error(decodeTxError(e), { id, description: hash ? "See Etherscan for details." : undefined });
        return null;
      }
      let record: TxRecordResult | null = null;
      if (o.record !== false) {
        try {
          record = await api.post<TxRecordResult>(
            "/api/tx/record",
            { tx_hash: hash, category_id: o.categoryId ?? undefined, note: o.note || undefined },
            { timeoutMs: 100_000, retries: 3 },
          );
        } catch (e) {
          toast.warning("Recorded on-chain; indexer sync delayed", { description: errMsg(e) });
        }
      }
      void refreshBalances();
      setTimeout(() => void refreshBalances(), 4000);
      return { hash, record };
    },
    [provider, connect, switchChain, getSigner, refreshBalances],
  );

  const value = useMemo<WalletCtx>(
    () => ({
      hydrated,
      installed: !!provider,
      walletName,
      isMobile,
      deepLink,
      address,
      chainId,
      isCorrectChain: chainId === CHAIN_ID,
      connecting,
      ethBalance,
      crpBalance,
      connect,
      disconnect,
      switchChain,
      watchAsset,
      refreshBalances,
      getSigner,
      signMessage,
      sendContractTx,
    }),
    [
      hydrated,
      provider,
      walletName,
      isMobile,
      deepLink,
      address,
      chainId,
      connecting,
      ethBalance,
      crpBalance,
      connect,
      disconnect,
      switchChain,
      watchAsset,
      refreshBalances,
      getSigner,
      signMessage,
      sendContractTx,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used inside WalletProvider");
  return c;
}
