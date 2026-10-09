import logging

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import chain, db, queries
from ..auth import require_admin, require_staff
from ..config import settings

log = logging.getLogger("crp.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _owner_safe() -> str | None:
    try:
        return await chain.get_owner()
    except Exception:
        return None


@router.get("/users")
async def users(q: str = Query("", max_length=100), role: str | None = Query(None, pattern="^(student|issuer|admin)$"),
                user: dict = Depends(require_staff)):
    like = f"%{q.strip()}%"
    args = [like]
    sql = """select * from profiles where ($1 = '%%' or full_name ilike $1 or email ilike $1 or roll_no ilike $1
             or department ilike $1 or wallet_address ilike $1)"""
    if role:
        args.append(role)
        sql += " and role = $2"
    rows = await db.fetch(sql + " order by full_name nulls last, email limit 100", *args)
    bals = await queries.balances_for([r["wallet_address"] for r in rows if r["wallet_address"]])
    owner = await _owner_safe()
    issuers = await queries.onchain_issuer_set()
    out = []
    for r in rows:
        w = r["wallet_address"]
        is_owner = bool(w and w == owner)
        out.append(queries.profile_out(r, is_owner, bool(w and (is_owner or w in issuers)),
                                       balance=bals.get(w, 0) if w else 0))
    return out


@router.get("/overview")
async def overview(user: dict = Depends(require_admin)):
    chain.trigger_sync()
    owner = await _owner_safe()
    issuer_set = await queries.onchain_issuer_set()
    if owner:
        issuer_set.add(owner)
    rows = await db.fetch(
        "select * from profiles where role in ('issuer','admin') or wallet_address = any($1::text[]) "
        "order by full_name nulls last", list(issuer_set))
    issuers = [queries.profile_out(r, bool(r["wallet_address"] and r["wallet_address"] == owner),
                                   bool(r["wallet_address"] and r["wallet_address"] in issuer_set)) for r in rows]
    return {
        "stats": await queries.stats(settings.contract_address),
        "pending_redemptions": await db.fetchval("select count(*) from redemptions where status='pending'"),
        "issuers": issuers,
        "recent": await queries.activity(limit=10),
    }


@router.post("/sync")
async def sync(user: dict = Depends(require_admin)):
    chain.require_configured()
    try:
        return await chain.sync_events(budget_s=25)
    except HTTPException:
        raise
    except Exception as e:
        log.warning("admin sync failed: %s", type(e).__name__)
        raise HTTPException(502, "Blockchain RPC error during sync")


# ---------------------------------------------------------------- categories
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    default_points: int = Field(ge=1, le=1000)
    icon: str | None = Field(default=None, max_length=50)
    active: bool = True


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    default_points: int | None = Field(default=None, ge=1, le=1000)
    icon: str | None = Field(default=None, max_length=50)
    active: bool | None = None


async def _patch(table: str, id_: int, fields: dict, not_null: tuple[str, ...]) -> dict:
    for k in not_null:
        if k in fields and fields[k] is None:
            raise HTTPException(400, f"{k} cannot be null")
    if fields:
        sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
        try:
            row = await db.fetchrow(f"update {table} set {sets} where id=$1 returning *", id_, *fields.values())
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "Name already exists")
    else:
        row = await db.fetchrow(f"select * from {table} where id=$1", id_)
    if not row:
        raise HTTPException(404, "Not found")
    return row


@router.post("/categories")
async def create_category(body: CategoryIn, user: dict = Depends(require_admin)):
    try:
        row = await db.fetchrow(
            "insert into reward_categories (name, description, default_points, icon, active) "
            "values ($1,$2,$3,$4,$5) returning *",
            body.name.strip(), body.description, body.default_points, body.icon, body.active)
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "Category name already exists")
    return queries.category_out(row)


@router.patch("/categories/{cid}")
async def update_category(cid: int, body: CategoryPatch, user: dict = Depends(require_admin)):
    row = await _patch("reward_categories", cid, body.model_dump(exclude_unset=True),
                       ("name", "default_points", "active"))
    return queries.category_out(row)


@router.delete("/categories/{cid}")
async def delete_category(cid: int, user: dict = Depends(require_admin)):
    if not await db.fetchval("update reward_categories set active=false where id=$1 returning id", cid):
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------------------------------------------------------- store items
class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    cost: int = Field(ge=1, le=10_000_000)
    stock: int | None = Field(default=None, ge=0)
    icon: str | None = Field(default=None, max_length=50)
    active: bool = True


class ItemPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    cost: int | None = Field(default=None, ge=1, le=10_000_000)
    stock: int | None = Field(default=None, ge=0)
    icon: str | None = Field(default=None, max_length=50)
    active: bool | None = None


@router.get("/store/items")
async def all_items(user: dict = Depends(require_admin)):
    return [queries.item_out(r) for r in await db.fetch("select * from store_items order by id")]


@router.post("/store/items")
async def create_item(body: ItemIn, user: dict = Depends(require_admin)):
    row = await db.fetchrow(
        "insert into store_items (name, description, cost, stock, icon, active) values ($1,$2,$3,$4,$5,$6) "
        "returning *", body.name.strip(), body.description, body.cost, body.stock, body.icon, body.active)
    return queries.item_out(row)


@router.patch("/store/items/{iid}")
async def update_item(iid: int, body: ItemPatch, user: dict = Depends(require_admin)):
    row = await _patch("store_items", iid, body.model_dump(exclude_unset=True), ("name", "cost", "active"))
    return queries.item_out(row)


@router.delete("/store/items/{iid}")
async def delete_item(iid: int, user: dict = Depends(require_admin)):
    if not await db.fetchval("update store_items set active=false where id=$1 returning id", iid):
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------------------------------------------------------- redemptions
@router.get("/redemptions")
async def redemptions(status: str | None = Query(None, pattern="^(pending|fulfilled|rejected)$"),
                      user: dict = Depends(require_admin)):
    if status:
        rows = await db.fetch(chain.REDEMPTION_SQL + " where r.status=$1 order by r.created_at desc limit 500", status)
    else:
        rows = await db.fetch(chain.REDEMPTION_SQL + " order by r.created_at desc limit 500")
    return [chain.redemption_out(r, with_profile=True) for r in rows]


class StatusBody(BaseModel):
    status: str = Field(pattern="^(fulfilled|rejected)$")


@router.post("/redemptions/{rid}/status")
async def set_redemption_status(rid: int, body: StatusBody, user: dict = Depends(require_admin)):
    cur = await db.fetchrow("select status, item_id from redemptions where id=$1", rid)
    if not cur:
        raise HTTPException(404, "Redemption not found")
    if cur["status"] != "pending":
        raise HTTPException(409, f"Redemption already {cur['status']}")
    updated = await db.fetchval(
        "update redemptions set status=$2, fulfilled_at=now(), fulfilled_by=$3 where id=$1 and status='pending' "
        "returning id", rid, body.status, user["id"])
    if not updated:
        raise HTTPException(409, "Redemption already processed")
    if body.status == "rejected" and cur["item_id"]:
        await db.execute("update store_items set stock = stock + 1 where id=$1 and stock is not null", cur["item_id"])
    r = await db.fetchrow(chain.REDEMPTION_SQL + " where r.id=$1", rid)
    return chain.redemption_out(r, with_profile=True)
