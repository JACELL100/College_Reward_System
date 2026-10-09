// All NEXT_PUBLIC_* reads go through here (literal access so Next can inline them).
const trim = (v: string | undefined) => (v ?? "").trim();

export const env = {
  supabaseUrl: trim(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: trim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  apiUrl: (trim(process.env.NEXT_PUBLIC_API_URL) || "http://localhost:8000").replace(/\/+$/, ""),
  contractAddress: trim(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS).toLowerCase(),
  chainId: Number(trim(process.env.NEXT_PUBLIC_CHAIN_ID) || "11155111"),
  rpcUrl: trim(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL) || "https://ethereum-sepolia-rpc.publicnode.com",
} as const;

export const isContractConfigured = /^0x[0-9a-fA-F]{40}$/.test(env.contractAddress);
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
