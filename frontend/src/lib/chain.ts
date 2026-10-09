import { Contract, Interface, JsonRpcProvider, isAddress } from "ethers";
import { env, isContractConfigured } from "./env";

export const CHAIN_ID = env.chainId;
export const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16);
export const EXPLORER = "https://sepolia.etherscan.io";
export const CONTRACT_ADDRESS = env.contractAddress;

export const SEPOLIA_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [env.rpcUrl],
  blockExplorerUrls: [EXPLORER],
};

export const FAUCETS = [
  { name: "Google Cloud faucet", url: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia" },
  { name: "Alchemy faucet", url: "https://www.alchemy.com/faucets/ethereum-sepolia" },
  { name: "PoW faucet", url: "https://sepolia-faucet.pk910.de/" },
];

export const CRP_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function owner() view returns (address)",
  "function isIssuer(address account) view returns (bool)",
  "function paused() view returns (bool)",
  "function maxIssuePerTx() view returns (uint256)",
  "function totalIssued() view returns (uint256)",
  "function totalRedeemed() view returns (uint256)",
  "function addIssuer(address account)",
  "function removeIssuer(address account)",
  "function transferOwnership(address newOwner)",
  "function setMaxIssuePerTx(uint256 newMax)",
  "function pause()",
  "function unpause()",
  "function issueReward(address to, uint256 amount, string reason)",
  "function batchIssueReward(address[] recipients, uint256[] amounts, string reason)",
  "function redeem(uint256 amount, uint256 itemId)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event RewardIssued(address indexed issuer, address indexed to, uint256 amount, string reason)",
  "event Redeemed(address indexed student, uint256 amount, uint256 indexed itemId)",
  "event IssuerAdded(address indexed account)",
  "event IssuerRemoved(address indexed account)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event MaxIssuePerTxUpdated(uint256 newMax)",
  "error NotOwner()",
  "error NotIssuer()",
  "error ContractPaused()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error InsufficientBalance(uint256 available, uint256 required)",
  "error InsufficientAllowance(uint256 available, uint256 required)",
  "error ExceedsMaxIssue(uint256 amount, uint256 max)",
  "error LengthMismatch()",
  "error BatchTooLarge(uint256 size, uint256 max)",
  "error ReasonTooLong()",
] as const;

export const crpInterface = new Interface(CRP_ABI);

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddr = (addr: string) => `${EXPLORER}/address/${addr}`;
export const explorerToken = (addr: string = CONTRACT_ADDRESS) => `${EXPLORER}/token/${addr}`;

let _provider: JsonRpcProvider | null = null;
export function readProvider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(env.rpcUrl, CHAIN_ID, { staticNetwork: true });
  return _provider;
}

export function readContract(): Contract | null {
  if (!isContractConfigured) return null;
  return new Contract(CONTRACT_ADDRESS, CRP_ABI, readProvider());
}

export interface ContractState {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  owner: string;
  paused: boolean;
  maxIssuePerTx: bigint;
  totalIssued: bigint;
  totalRedeemed: bigint;
}

export async function readContractState(): Promise<ContractState | null> {
  const c = readContract();
  if (!c) return null;
  const [name, symbol, decimals, totalSupply, owner, paused, maxIssuePerTx, totalIssued, totalRedeemed] =
    await Promise.all([
      c.name(),
      c.symbol(),
      c.decimals(),
      c.totalSupply(),
      c.owner(),
      c.paused(),
      c.maxIssuePerTx(),
      c.totalIssued(),
      c.totalRedeemed(),
    ]);
  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply,
    owner: String(owner).toLowerCase(),
    paused,
    maxIssuePerTx,
    totalIssued,
    totalRedeemed,
  };
}

export async function readCrpBalance(address: string): Promise<bigint | null> {
  const c = readContract();
  if (!c || !isAddress(address)) return null;
  return (await c.balanceOf(address)) as bigint;
}

export async function readIsIssuer(address: string): Promise<boolean | null> {
  const c = readContract();
  if (!c || !isAddress(address)) return null;
  return (await c.isIssuer(address)) as boolean;
}

/* ------------------------- Friendly error decoding ------------------------- */

const ERROR_TEXT: Record<string, (args: readonly unknown[]) => string> = {
  NotOwner: () => "Only the contract owner can do this.",
  NotIssuer: () => "This wallet is not an authorised issuer on-chain.",
  ContractPaused: () => "The contract is paused by the admin. Try again later.",
  ZeroAddress: () => "The zero address is not a valid recipient.",
  ZeroAmount: () => "Amount must be greater than zero.",
  InsufficientBalance: (a) => `Insufficient CRP balance: you have ${a[0]}, need ${a[1]}.`,
  InsufficientAllowance: (a) => `Insufficient allowance: approved ${a[0]}, need ${a[1]}.`,
  ExceedsMaxIssue: (a) => `Amount ${a[0]} exceeds the per-transaction limit of ${a[1]} CRP.`,
  LengthMismatch: () => "Recipients and amounts lists differ in length.",
  BatchTooLarge: (a) => `Batch too large (${a[0]}). Maximum is ${a[1]} recipients.`,
  ReasonTooLong: () => "Reason is too long (max 96 bytes).",
};

function findRevertData(e: unknown, depth = 0): string | null {
  if (!e || typeof e !== "object" || depth > 5) return null;
  const o = e as Record<string, unknown>;
  for (const k of ["data", "error", "info", "payload"]) {
    const v = o[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{8}/.test(v)) return v;
    if (v && typeof v === "object") {
      const inner = findRevertData(v, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

export function isUserRejection(e: unknown) {
  const err = (e ?? {}) as { code?: string | number; info?: { error?: { code?: number } } };
  return err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001;
}

export function decodeTxError(e: unknown): string {
  const err = (e ?? {}) as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
    reason?: string;
    revert?: { name?: string; args?: readonly unknown[] };
    info?: { error?: { code?: number; message?: string } };
    error?: { code?: number; message?: string };
  };
  const nestedCode = err.info?.error?.code ?? err.error?.code;
  if (err.code === "ACTION_REJECTED" || err.code === 4001 || nestedCode === 4001)
    return "You rejected the request in MetaMask.";
  if (err.code === -32002 || nestedCode === -32002)
    return "A MetaMask request is already pending. Open MetaMask to continue.";
  const msg = `${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`.toLowerCase();
  if (err.code === "INSUFFICIENT_FUNDS" || msg.includes("insufficient funds"))
    return "Not enough Sepolia ETH for gas. Use the gas drip on your dashboard or a Sepolia faucet.";
  if (err.revert?.name && ERROR_TEXT[err.revert.name]) return ERROR_TEXT[err.revert.name](err.revert.args ?? []);
  const data = findRevertData(e);
  if (data) {
    try {
      const parsed = crpInterface.parseError(data);
      if (parsed && ERROR_TEXT[parsed.name]) return ERROR_TEXT[parsed.name](parsed.args);
    } catch {
      /* ignore */
    }
  }
  if (msg.includes("user rejected") || msg.includes("user denied")) return "You rejected the request in MetaMask.";
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage;
  return err.message?.slice(0, 160) || "Transaction failed";
}
