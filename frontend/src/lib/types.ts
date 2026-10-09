export type Role = "student" | "issuer" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  wallet_address: string | null;
  department: string | null;
  roll_no: string | null;
  gas_dripped_at: string | null;
  created_at: string;
  is_contract_owner: boolean;
  is_onchain_issuer: boolean;
}

export interface AdminUser extends Profile {
  balance: number;
}

export interface MiniProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface CategoryRef {
  id: number;
  name: string;
  icon: string | null;
}

export type ActivityType = "issue" | "transfer" | "redeem";

export interface Activity {
  tx_hash: string;
  log_index: number;
  block_number: number;
  block_time: string | null;
  type: ActivityType;
  from_address: string | null;
  to_address: string | null;
  amount: number;
  reason: string | null;
  item_id: number | null;
  category: CategoryRef | null;
  note: string | null;
  from_profile: MiniProfile | null;
  to_profile: MiniProfile | null;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  default_points: number;
  icon: string | null;
  active: boolean;
}

export interface StoreItem {
  id: number;
  name: string;
  description: string | null;
  cost: number;
  stock: number | null;
  icon: string | null;
  active: boolean;
}

export type RedemptionStatus = "pending" | "fulfilled" | "rejected";

export interface Redemption {
  id: number;
  tx_hash: string;
  item: { id: number; name: string; icon: string | null } | null;
  amount: number;
  status: RedemptionStatus;
  code: string;
  created_at: string;
  fulfilled_at: string | null;
  profile?: { id: string; full_name: string | null; email: string; avatar_url: string | null };
}

export interface LeaderboardEntry {
  rank: number;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  wallet_address: string | null;
  balance: number;
  earned: number;
}

export interface Leaderboard {
  items: LeaderboardEntry[];
  me: { rank: number; balance: number; earned: number } | null;
}

export interface PublicStats {
  total_supply: number;
  total_issued: number;
  total_redeemed: number;
  holders: number;
  transactions: number;
  students: number;
  contract_address: string | null;
}

export interface DirectoryEntry {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  role: Role;
  wallet_address: string;
  email_hint: string | null;
}

export interface GasDripStatus {
  enabled: boolean;
  eligible: boolean;
  amount_eth: number | string;
  reason?: string | null;
}

export interface TxRecordResult {
  status: "confirmed" | "failed";
  events: unknown[];
  redemption: Redemption | null;
}

export interface AdminOverview {
  stats: PublicStats;
  pending_redemptions: number;
  issuers: Profile[];
  recent: Activity[];
}

export interface RewardSuggestion {
  category_id: number | null;
  category_name: string | null;
  points: number;
  reason: string;
  rationale: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
