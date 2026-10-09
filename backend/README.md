# CampusCoin backend (FastAPI)

REST API for the College Reward Points (CRP) DApp. Contract: `docs/INTERFACES.md` (§2 DB, §3 roles, §4 API).

## Run locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows (bash: source .venv/Scripts/activate) — Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then fill in values
python migrate.py               # idempotent: tables, indexes, RLS, seed data
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/api/health and http://localhost:8000/docs.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres (transaction pooler, port 6543 — asyncpg runs with `statement_cache_size=0`) |
| `SUPABASE_URL` | Used for JWKS (`/auth/v1/.well-known/jwks.json`) and `/auth/v1/user` fallback |
| `SUPABASE_ANON_KEY` | `apikey` header for the `/auth/v1/user` fallback |
| `SUPABASE_JWT_SECRET` | Optional, verifies legacy HS256 tokens locally |
| `FRONTEND_ORIGINS` | Comma list of CORS origins (`https://*.vercel.app` is always allowed) |
| `ADMIN_EMAILS` | Comma list of emails that are always `admin` |
| `SEPOLIA_RPC_URL`, `CHAIN_ID` | Sepolia RPC + chain id (11155111) |
| `CONTRACT_ADDRESS`, `CONTRACT_DEPLOY_BLOCK` | Deployed CRP contract; empty address → chain features return 503, health `chain:false` |
| `GAS_DRIP_PRIVATE_KEY`, `GAS_DRIP_AMOUNT_ETH`, `GAS_DRIP_MIN_BALANCE_ETH` | Optional one-time Sepolia ETH drip per student |
| `GROQ_API_KEY`, `GROQ_MODEL` | AI assistant + reward suggestions (Groq OpenAI-compatible API) |

The ABI is read from `app/abi/CollegeRewardPoints.json` (written by the contract build).

## Deploy on Render (free web service)

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/api/health`
- Python 3.11 (`runtime.txt` / `.python-version`); set env vars above in the dashboard.

Render free instances sleep after ~15 min idle. There is no long-running worker: the event indexer runs in the
background on startup and on demand (throttled to once per 60 s from GET endpoints, `POST /api/admin/sync` for
admins, and `POST /api/tx/record` indexes a specific transaction immediately).
