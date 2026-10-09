from fastapi import APIRouter, Depends

from .. import chain, db, queries
from ..auth import get_current_user

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/categories")
async def categories(user: dict = Depends(get_current_user)):
    rows = await db.fetch("select * from reward_categories where active order by name")
    return [queries.category_out(r) for r in rows]


@router.get("/store/items")
async def store_items(user: dict = Depends(get_current_user)):
    rows = await db.fetch("select * from store_items where active order by cost, id")
    return [queries.item_out(r) for r in rows]


@router.get("/redemptions/mine")
async def my_redemptions(user: dict = Depends(get_current_user)):
    args = [user["id"]]
    sql = chain.REDEMPTION_SQL + " where r.profile_id = $1"
    if user.get("wallet_address"):
        args.append(user["wallet_address"])
        sql += " or r.wallet_address = $2"
    rows = await db.fetch(sql + " order by r.created_at desc limit 200", *args)
    return [chain.redemption_out(r) for r in rows]
