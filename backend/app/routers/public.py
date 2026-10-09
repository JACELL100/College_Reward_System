from fastapi import APIRouter

from .. import chain, db, queries
from ..config import settings

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
async def health():
    return {"status": "ok", "db": await db.db_ok(), "chain": await chain.rpc_ok(),
            "contract_address": settings.contract_address, "chain_id": settings.CHAIN_ID}


@router.get("/public/config")
async def public_config():
    return {
        "contract_address": settings.contract_address, "chain_id": settings.CHAIN_ID,
        "deploy_block": settings.CONTRACT_DEPLOY_BLOCK, "explorer_url": settings.EXPLORER_URL,
        "token": {"name": "College Reward Points", "symbol": "CRP", "decimals": 0},
    }


@router.get("/public/stats")
async def public_stats():
    chain.trigger_sync()
    return await queries.stats(settings.contract_address)


@router.get("/public/recent")
async def public_recent():
    chain.trigger_sync()
    return await queries.activity(limit=8)
