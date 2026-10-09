# College Reward Points (CRP) — Shared Interface Spec

Single source of truth that the contract, backend and frontend are built against.
Product name: **CampusCoin** — "College Reward Points" (token symbol **CRP**). Fr. Conceicao Rodrigues College of Engineering (FRCRCE), Bandra.

## 0. Repo layout & ownership

```
contracts/CollegeRewardPoints.sol        (contract agent)
blockchain/                              (contract agent) web3.py compile/test/deploy, build/, deployments/
backend/                                 (backend agent)  FastAPI app — Render
  app/abi/CollegeRewardPoints.json       (written by contract agent: JSON ABI array only)
frontend/                                (frontend agent) Next.js app — Vercel
docs/, README.md, render.yaml, .gitignore (docs agent)
.venv/                                   shared local Python venv (Python 3.11) at repo root
```

Hosting: Vercel free (frontend), Render free (backend — sleeps after 15 min idle, ~50 s cold start), Supabase free (Postgres + Google OAuth).
Chain: **Sepolia**, chainId `11155111` (hex `0xaa36a7`), explorer `https://sepolia.etherscan.io`, default RPC `https://ethereum-sepolia-rpc.publicnode.com` (CORS-enabled, free).

## 1. Smart contract — `CollegeRewardPoints` (Solidity ^0.8.24, self-contained, no imports)

ERC20 with `name = "College Reward Points"`, `symbol = "CRP"`, **`decimals = 0`** (whole points). Initial supply 0. Deployer = owner = first issuer.

Human-readable ABI (ethers v6 format — frontend may use this verbatim):

```
// ERC20
function name() view returns (string)
function symbol() view returns (string)
function decimals() view returns (uint8)
function totalSupply() view returns (uint256)
function balanceOf(address account) view returns (uint256)
function allowance(address owner, address spender) view returns (uint256)
function transfer(address to, uint256 amount) returns (bool)
function approve(address spender, uint256 amount) returns (bool)
function transferFrom(address from, address to, uint256 amount) returns (bool)
// Admin / roles
function owner() view returns (address)
function isIssuer(address account) view returns (bool)
function paused() view returns (bool)
function maxIssuePerTx() view returns (uint256)
function totalIssued() view returns (uint256)
function totalRedeemed() view returns (uint256)
function addIssuer(address account)
function removeIssuer(address account)
function transferOwnership(address newOwner)
function setMaxIssuePerTx(uint256 newMax)
function pause()
function unpause()
// Rewards
function issueReward(address to, uint256 amount, string reason)
function batchIssueReward(address[] recipients, uint256[] amounts, string reason)
function redeem(uint256 amount, uint256 itemId)
// Events
event Transfer(address indexed from, address indexed to, uint256 value)
event Approval(address indexed owner, address indexed spender, uint256 value)
event RewardIssued(address indexed issuer, address indexed to, uint256 amount, string reason)
event Redeemed(address indexed student, uint256 amount, uint256 indexed itemId)
event IssuerAdded(address indexed account)
event IssuerRemoved(address indexed account)
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
event Paused(address account)
event Unpaused(address account)
event MaxIssuePerTxUpdated(uint256 newMax)
// Custom errors
error NotOwner()
error NotIssuer()
error ContractPaused()
error ZeroAddress()
error ZeroAmount()
error InsufficientBalance(uint256 available, uint256 required)
error InsufficientAllowance(uint256 available, uint256 required)
error ExceedsMaxIssue(uint256 amount, uint256 max)
error LengthMismatch()
error BatchTooLarge(uint256 size, uint256 max)
error ReasonTooLong()
```

Rules: `issueReward`/`batchIssueReward` — onlyIssuer, whenNotPaused, amount>0, amount ≤ maxIssuePerTx (default **1000**, per recipient), batch ≤ **50** recipients, reason ≤ **96 bytes**; mint emits `Transfer(0x0,to,amt)` then `RewardIssued`. `redeem` — whenNotPaused, burns caller's tokens, emits `Transfer(from,0x0,amt)` then `Redeemed`. `transfer`/`transferFrom` blocked when paused; to≠0x0. `removeIssuer(owner)` is allowed only if… (owner always counts as issuer via `isIssuer`). `transferOwnership` emits event; new owner implicitly issuer.

Artifacts (contract agent):
- `blockchain/build/CollegeRewardPoints.json` → `{ "contractName", "abi", "bytecode", "compiler" }`
- `blockchain/deployments/sepolia.json` → `{ "network":"sepolia","chainId":11155111,"address","deployBlock","txHash","deployer","deployedAt" }`
- `backend/app/abi/CollegeRewardPoints.json` → JSON ABI array.

## 2. Database (Supabase Postgres, `public` schema). Owned/applied by backend agent.

All addresses stored **lowercase**. RLS **enabled with no policies** on every table (only the backend's `postgres` role, which bypasses RLS, can touch them; the anon key exposed in the browser cannot read them via PostgREST).

```sql
profiles(id uuid pk /* = auth.users.id */, email text unique not null, full_name text, avatar_url text,
         role text not null default 'student' check (role in ('student','issuer','admin')),
         wallet_address text unique, department text, roll_no text, gas_dripped_at timestamptz,
         created_at timestamptz default now(), updated_at timestamptz default now())
reward_categories(id serial pk, name text unique not null, description text, default_points int not null check (default_points>0),
         icon text /* lucide icon name */, active bool default true, created_at timestamptz default now())
store_items(id serial pk, name text not null, description text, cost int not null check (cost>0), stock int /* null = unlimited */,
         icon text, active bool default true, created_at timestamptz default now())
chain_events(tx_hash text, log_index int, block_number bigint not null, block_time timestamptz,
         event text not null, from_address text, to_address text, amount numeric(78,0), reason text,
         item_id bigint, issuer text, primary key (tx_hash, log_index))
tx_meta(tx_hash text pk, category_id int references reward_categories(id), note text, created_by uuid references profiles(id), created_at timestamptz default now())
redemptions(id serial pk, tx_hash text unique not null, profile_id uuid references profiles(id), wallet_address text not null,
         item_id int references store_items(id), amount int not null, status text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
         code text not null /* 8-char voucher code */, created_at timestamptz default now(), fulfilled_at timestamptz, fulfilled_by uuid references profiles(id))
sync_state(key text pk, last_block bigint not null, updated_at timestamptz default now())
```
Seed: 6 reward categories (Hackathon Win 200, Paper Publication 300, Event Volunteering 50, Perfect Attendance 100, Sports Achievement 150, Club Leadership 120) and 6 store items (Canteen Meal Voucher 50, Library Late-Fee Waiver 80, College Hoodie 400, Printing Credits ×50 pages 30, Fest Pass 250, Lab Priority Slot 120).

## 3. Roles (blockchain is the source of truth)

On every `GET /api/me` the backend recomputes and caches `profiles.role`:
`admin` if email ∈ `ADMIN_EMAILS` **or** linked wallet == `owner()` on-chain → else `issuer` if `isIssuer(wallet)` on-chain → else `student`.
Promoting a faculty member = owner sends `addIssuer(wallet)` from MetaMask → frontend calls `POST /api/tx/record` → backend sees `IssuerAdded` and refreshes that profile's role.
Only on-chain-authorised wallets can actually mint — the DB role only gates UI/off-chain endpoints.

## 4. Backend REST API (FastAPI). Base: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`)

Auth: `Authorization: Bearer <supabase access_token>`. Errors: `{ "detail": "message" }` with proper status codes. All amounts are integers (JSON numbers). All addresses returned **lowercase**; `block_time` ISO-8601.

Profile object:
```json
{ "id","email","full_name","avatar_url","role","wallet_address","department","roll_no","gas_dripped_at","created_at",
  "is_contract_owner": false, "is_onchain_issuer": false }
```
Activity item:
```json
{ "tx_hash","log_index","block_number","block_time","type":"issue|transfer|redeem","from_address","to_address","amount",
  "reason": null, "item_id": null, "category": {"id","name","icon"} | null, "note": null,
  "from_profile": {"id","full_name","avatar_url"} | null, "to_profile": {...} | null }
```
(type: Transfer from 0x0 → `issue` (reason from the RewardIssued in same tx), to 0x0 → `redeem`, else `transfer`.)

### Public (no auth)
| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{status:"ok", db:bool, chain:bool, contract_address, chain_id}` |
| GET | `/api/public/config` | `{contract_address, chain_id, deploy_block, explorer_url, token:{name,symbol,decimals}}` |
| GET | `/api/public/stats` | `{total_supply, total_issued, total_redeemed, holders, transactions, students, contract_address}` |
| GET | `/api/public/recent` | last 8 activity items (names only, no emails) |

### Authenticated
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/me` | – | Profile (creates row on first call from JWT claims: email, user_metadata.full_name/name, avatar_url/picture) |
| PATCH | `/api/me` | `{full_name?, department?, roll_no?}` | Profile |
| GET | `/api/wallet/link-message` | – | `{message}` — text to `personal_sign`; contains user id, email, ISO "Issued At", random nonce |
| POST | `/api/wallet/link` | `{address, message, signature}` | Profile. Verifies signer==address, message user id == caller, issued ≤10 min ago. 409 if wallet linked to someone else |
| DELETE | `/api/wallet/link` | – | Profile |
| GET | `/api/wallet/gas-drip/status` | – | `{enabled, eligible, amount_eth, reason?}` |
| POST | `/api/wallet/gas-drip` | – | `{tx_hash, amount_eth}` — once per profile, only if wallet ETH < min. 503 if disabled |
| GET | `/api/directory?q=` | – | `[{id, full_name, avatar_url, department, role, wallet_address, email_hint}]` (only profiles with wallet; `email_hint` like `jo***@gmail.com`; max 20) |
| POST | `/api/tx/record` | `{tx_hash, category_id?, note?}` | `{status:"confirmed"|"failed", events:[...], redemption: Redemption|null}` waits ≤90 s for receipt, decodes our contract's logs, upserts chain_events/tx_meta, creates redemption on Redeemed, refreshes roles on IssuerAdded/IssuerRemoved/OwnershipTransferred. Idempotent. |
| GET | `/api/activity?limit=50&before_block=&type=&scope=me|all` | – | `{items:[Activity]}` (`scope=all` admin/issuer only). Triggers a throttled background chain sync. |
| GET | `/api/leaderboard?limit=25` | – | `{items:[{rank, profile_id, full_name, avatar_url, department, wallet_address, balance, earned}], me: {rank, balance, earned}|null}` — balances computed from indexed events |
| GET | `/api/categories` | – | `[Category]` active only |
| GET | `/api/store/items` | – | `[StoreItem {id,name,description,cost,stock,icon,active}]` active only |
| GET | `/api/redemptions/mine` | – | `[Redemption {id,tx_hash,item:{id,name,icon},amount,status,code,created_at,fulfilled_at}]` |
| POST | `/api/ai/chat` | `{messages:[{role:"user"|"assistant", content}]}` | `{reply}` — Groq; system prompt grounded with caller's balance, rank, recent activity, store items, categories, and CRP/Ethereum explainer knowledge |

### Issuer / admin (role ∈ issuer, admin)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/ai/suggest-reward` | `{description}` | `{category_id, category_name, points, reason, rationale}` — reason ≤ 90 chars, points ≤ 1000 |
| GET | `/api/admin/users?q=&role=` | – | `[Profile + {balance}]` max 100 |

### Admin only
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/admin/overview` | – | `{stats (as public/stats), pending_redemptions, issuers:[Profile], recent:[Activity]}` |
| POST | `/api/admin/sync` | – | `{from_block, to_block, events_indexed}` |
| POST/PATCH/DELETE | `/api/admin/categories[/{id}]` | Category fields | Category / `{ok:true}` (DELETE = soft, active=false) |
| GET | `/api/admin/store/items` | – | all items incl. inactive |
| POST/PATCH/DELETE | `/api/admin/store/items[/{id}]` | StoreItem fields | StoreItem / `{ok:true}` |
| GET | `/api/admin/redemptions?status=` | – | `[Redemption + {profile:{id,full_name,email,avatar_url}}]` |
| POST | `/api/admin/redemptions/{id}/status` | `{status:"fulfilled"|"rejected"}` | Redemption |

## 5. Environment variables

backend/.env (already created, contains real secrets — never commit): `DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, FRONTEND_ORIGINS (comma list), ADMIN_EMAILS (comma list), SEPOLIA_RPC_URL, CHAIN_ID, CONTRACT_ADDRESS, CONTRACT_DEPLOY_BLOCK, GAS_DRIP_PRIVATE_KEY, GAS_DRIP_AMOUNT_ETH, GAS_DRIP_MIN_BALANCE_ETH, GROQ_API_KEY, GROQ_MODEL`

frontend/.env.local:
```
NEXT_PUBLIC_SUPABASE_URL=https://pzcimxioslwojjjotrde.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CONTRACT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

blockchain/.env (already created): `SEPOLIA_RPC_URL, CHAIN_ID, DEPLOYER_PRIVATE_KEY`
