"""Shared SQL: activity derivation, balances, stats, serializers."""
import re

from fastapi import HTTPException

from . import db
from .config import ZERO_ADDRESS as ZERO

ADDR_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
TX_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


def norm_address(a: str | None, field: str = "address") -> str:
    if not a or not ADDR_RE.match(a.strip()):
        raise HTTPException(400, f"Invalid {field}")
    return a.strip().lower()


def norm_tx(h: str | None) -> str:
    if not h or not TX_RE.match(h.strip()):
        raise HTTPException(400, "Invalid transaction hash")
    return h.strip().lower()


PROFILE_FIELDS = ("id", "email", "full_name", "avatar_url", "role", "wallet_address", "department", "roll_no",
                  "gas_dripped_at", "created_at")


def profile_out(p: dict, is_owner: bool = False, is_issuer: bool = False, **extra) -> dict:
    out = {k: p.get(k) for k in PROFILE_FIELDS}
    out["is_contract_owner"] = bool(is_owner)
    out["is_onchain_issuer"] = bool(is_issuer)
    out.update(extra)
    return out


def category_out(c: dict) -> dict:
    return {k: c.get(k) for k in ("id", "name", "description", "default_points", "icon", "active")}


def item_out(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "name", "description", "cost", "stock", "icon", "active")}


# ---------------------------------------------------------------- activity
ACTIVITY_SQL = f"""
select t.tx_hash, t.log_index, t.block_number, t.block_time, t.from_address, t.to_address, t.amount,
  case when t.from_address = '{ZERO}' then 'issue' when t.to_address = '{ZERO}' then 'redeem' else 'transfer' end as type,
  ri.reason, rd.item_id, m.note,
  c.id as c_id, c.name as c_name, c.icon as c_icon,
  fp.id as fp_id, fp.full_name as fp_name, fp.avatar_url as fp_avatar,
  tp.id as tp_id, tp.full_name as tp_name, tp.avatar_url as tp_avatar
from chain_events t
left join lateral (
  select r.reason from chain_events r
  where t.from_address = '{ZERO}' and r.tx_hash = t.tx_hash and r.event = 'RewardIssued'
    and r.to_address = t.to_address and r.log_index > t.log_index
  order by r.log_index limit 1) ri on true
left join lateral (
  select r.item_id from chain_events r
  where t.to_address = '{ZERO}' and r.tx_hash = t.tx_hash and r.event = 'Redeemed'
    and r.from_address = t.from_address and r.log_index > t.log_index
  order by r.log_index limit 1) rd on true
left join tx_meta m on m.tx_hash = t.tx_hash
left join reward_categories c on c.id = m.category_id
left join profiles fp on fp.wallet_address = t.from_address and t.from_address <> '{ZERO}'
left join profiles tp on tp.wallet_address = t.to_address and t.to_address <> '{ZERO}'
where t.event = 'Transfer'
"""


def activity_out(r: dict) -> dict:
    return {
        "tx_hash": r["tx_hash"], "log_index": r["log_index"], "block_number": r["block_number"],
        "block_time": r["block_time"], "type": r["type"], "from_address": r["from_address"],
        "to_address": r["to_address"], "amount": r["amount"], "reason": r["reason"], "item_id": r["item_id"],
        "category": {"id": r["c_id"], "name": r["c_name"], "icon": r["c_icon"]} if r["c_id"] else None,
        "note": r["note"],
        "from_profile": {"id": r["fp_id"], "full_name": r["fp_name"], "avatar_url": r["fp_avatar"]} if r["fp_id"] else None,
        "to_profile": {"id": r["tp_id"], "full_name": r["tp_name"], "avatar_url": r["tp_avatar"]} if r["tp_id"] else None,
    }


async def activity(limit: int = 50, wallet: str | None = None, before_block: int | None = None,
                   type_: str | None = None) -> list[dict]:
    sql, args = ACTIVITY_SQL, []
    if wallet:
        args.append(wallet)
        sql += f" and (t.from_address = ${len(args)} or t.to_address = ${len(args)})"
    if before_block is not None:
        args.append(before_block)
        sql += f" and t.block_number < ${len(args)}"
    if type_ == "issue":
        sql += f" and t.from_address = '{ZERO}'"
    elif type_ == "redeem":
        sql += f" and t.to_address = '{ZERO}'"
    elif type_ == "transfer":
        sql += f" and t.from_address <> '{ZERO}' and t.to_address <> '{ZERO}'"
    args.append(max(1, min(int(limit), 200)))
    sql += f" order by t.block_number desc, t.log_index desc limit ${len(args)}"
    return [activity_out(r) for r in await db.fetch(sql, *args)]


# ---------------------------------------------------------------- balances
BALANCES_CTE = f"""
with flows as (
  select to_address as addr, amount as inflow, 0::numeric as outflow,
         case when from_address = '{ZERO}' then amount else 0 end as earned
  from chain_events where event = 'Transfer' and to_address <> '{ZERO}'
  union all
  select from_address, 0, amount, 0 from chain_events where event = 'Transfer' and from_address <> '{ZERO}'
), bal as (
  select addr, sum(inflow) - sum(outflow) as balance, sum(earned) as earned from flows group by addr
)
"""

LEADERBOARD_SQL = BALANCES_CTE + """
, ranked as (
  select p.id as profile_id, p.full_name, p.avatar_url, p.department, p.wallet_address,
         coalesce(b.balance, 0) as balance, coalesce(b.earned, 0) as earned,
         rank() over (order by coalesce(b.balance, 0) desc, coalesce(b.earned, 0) desc) as rank
  from profiles p left join bal b on b.addr = p.wallet_address
  where p.wallet_address is not null
)
"""


async def leaderboard(limit: int = 25) -> list[dict]:
    return await db.fetch(
        LEADERBOARD_SQL + " select * from ranked order by rank, full_name nulls last limit $1",
        max(1, min(int(limit), 100)))


async def my_rank(wallet: str | None) -> dict | None:
    if not wallet:
        return None
    r = await db.fetchrow(LEADERBOARD_SQL + " select rank, balance, earned from ranked where wallet_address=$1",
                          wallet)
    return {"rank": r["rank"], "balance": r["balance"], "earned": r["earned"]} if r else None


async def balances_for(addresses: list[str]) -> dict[str, int]:
    if not addresses:
        return {}
    rows = await db.fetch(BALANCES_CTE + " select addr, balance from bal where addr = any($1::text[])", addresses)
    return {r["addr"]: r["balance"] for r in rows}


async def stats(contract_address: str | None) -> dict:
    r = await db.fetchrow(BALANCES_CTE + f"""
      select
        (select coalesce(sum(amount),0) from chain_events where event='Transfer' and from_address='{ZERO}') as issued,
        (select coalesce(sum(amount),0) from chain_events where event='Transfer' and to_address='{ZERO}') as redeemed,
        (select count(*) from bal where balance > 0) as holders,
        (select count(distinct tx_hash) from chain_events) as transactions,
        (select count(*) from profiles where role = 'student') as students
    """)
    return {
        "total_supply": r["issued"] - r["redeemed"], "total_issued": r["issued"], "total_redeemed": r["redeemed"],
        "holders": r["holders"], "transactions": r["transactions"], "students": r["students"],
        "contract_address": contract_address,
    }


async def onchain_issuer_set() -> set[str]:
    """Issuers derived from indexed IssuerAdded/IssuerRemoved events (latest wins)."""
    rows = await db.fetch("""
      select distinct on (to_address) to_address, event from chain_events
      where event in ('IssuerAdded','IssuerRemoved') order by to_address, block_number desc, log_index desc""")
    return {r["to_address"] for r in rows if r["event"] == "IssuerAdded"}
