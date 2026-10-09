import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import ai, chain, db, queries
from ..auth import effective_role, get_current_user, require_staff

log = logging.getLogger("crp.activity")
router = APIRouter(prefix="/api", tags=["activity"])


class RecordBody(BaseModel):
    tx_hash: str
    category_id: int | None = None
    note: str | None = Field(default=None, max_length=500)


def _event_out(r: dict) -> dict:
    return {k: r[k] for k in ("tx_hash", "log_index", "block_number", "block_time", "event", "from_address",
                              "to_address", "amount", "reason", "item_id", "issuer")}


@router.post("/tx/record")
async def record_tx(body: RecordBody, user: dict = Depends(get_current_user)):
    tx = queries.norm_tx(body.tx_hash)
    chain.require_configured()
    if body.category_id is not None and not await db.fetchval(
            "select 1 from reward_categories where id=$1", body.category_id):
        raise HTTPException(400, "Unknown category")
    try:
        status, rows, reds = await chain.record_tx(tx)
    except HTTPException:
        raise
    except Exception as e:
        log.warning("record_tx failed: %s", type(e).__name__)
        raise HTTPException(502, "Blockchain RPC error")
    if status == "confirmed" and rows and (body.category_id is not None or (body.note or "").strip()):
        await db.execute(
            """insert into tx_meta (tx_hash, category_id, note, created_by) values ($1,$2,$3,$4)
               on conflict (tx_hash) do update set
                 category_id = coalesce(excluded.category_id, tx_meta.category_id),
                 note = coalesce(excluded.note, tx_meta.note)""",
            tx, body.category_id, (body.note or "").strip() or None, user["id"])
    return {"status": status, "events": [_event_out(r) for r in rows], "redemption": reds[0] if reds else None}


@router.get("/activity")
async def get_activity(limit: int = Query(50, ge=1, le=200), before_block: int | None = Query(None, ge=0),
                       type: str | None = Query(None, pattern="^(issue|transfer|redeem)$"),
                       scope: str = Query("me", pattern="^(me|all)$"),
                       user: dict = Depends(get_current_user)):
    chain.trigger_sync()
    if scope == "all":
        if effective_role(user) not in ("issuer", "admin"):
            raise HTTPException(403, "Issuer or admin role required for scope=all")
        items = await queries.activity(limit, None, before_block, type)
    else:
        if not user.get("wallet_address"):
            return {"items": []}
        items = await queries.activity(limit, user["wallet_address"], before_block, type)
    return {"items": items}


@router.get("/leaderboard")
async def leaderboard(limit: int = Query(25, ge=1, le=100), user: dict = Depends(get_current_user)):
    chain.trigger_sync()
    rows = await queries.leaderboard(limit)
    items = [{k: r[k] for k in ("rank", "profile_id", "full_name", "avatar_url", "department", "wallet_address",
                                "balance", "earned")} for r in rows]
    return {"items": items, "me": await queries.my_rank(user.get("wallet_address"))}


# ---------------------------------------------------------------- AI
class SuggestBody(BaseModel):
    description: str = Field(min_length=3, max_length=2000)


@router.post("/ai/suggest-reward")
async def suggest_reward(body: SuggestBody, user: dict = Depends(require_staff)):
    ai.require_ai()
    cats = await db.fetch("select * from reward_categories where active order by id")
    return await ai.suggest_reward(body.description, cats)


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=8000)


class ChatBody(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)


_chat_hits: dict[str, list[float]] = {}


@router.post("/ai/chat")
async def ai_chat(body: ChatBody, user: dict = Depends(get_current_user)):
    import time
    ai.require_ai()
    now = time.time()
    hits = [t for t in _chat_hits.get(str(user["id"]), []) if now - t < 60]
    if len(hits) >= 20:
        raise HTTPException(429, "Too many messages; slow down a little")
    _chat_hits[str(user["id"])] = hits + [now]
    wallet = user.get("wallet_address")
    me = await queries.my_rank(wallet) or {}
    ctx = {
        "user": user,
        "balance": me.get("balance", 0), "earned": me.get("earned", 0), "rank": me.get("rank"),
        "activity": await queries.activity(10, wallet) if wallet else [],
        "store": await db.fetch("select * from store_items where active order by cost"),
        "categories": await db.fetch("select * from reward_categories where active order by name"),
    }
    reply = await ai.chat([m.model_dump() for m in body.messages], ctx)
    return {"reply": reply}
