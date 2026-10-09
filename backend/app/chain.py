"""Sepolia access: contract reads, receipt decoding, event-log indexing."""
import asyncio
import json
import logging
import secrets
import string
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from web3 import AsyncWeb3, Web3
from web3.providers.rpc import AsyncHTTPProvider

from . import db
from .config import ZERO_ADDRESS, settings

log = logging.getLogger("crp.chain")

ABI_PATH = Path(__file__).resolve().parent / "abi" / "CollegeRewardPoints.json"
INDEXED_EVENTS = {
    "Transfer", "RewardIssued", "Redeemed", "IssuerAdded", "IssuerRemoved",
    "OwnershipTransferred", "Paused", "Unpaused", "MaxIssuePerTxUpdated",
}

_abi: list | None = None
_abi_mtime: float | None = None
_w3: AsyncWeb3 | None = None
_contract = None
_topics: dict[str, dict] = {}  # topic0 hex -> event abi
_cache: dict[str, tuple[float, object]] = {}
_sync_lock = asyncio.Lock()
_last_sync_trigger = 0.0
_bg_tasks: set[asyncio.Task] = set()
_block_time_cache: dict[int, datetime] = {}


# ---------------------------------------------------------------- setup
def load_abi() -> list | None:
    global _abi, _abi_mtime, _contract, _topics
    if not ABI_PATH.exists():
        return None
    mtime = ABI_PATH.stat().st_mtime
    if _abi is not None and mtime == _abi_mtime:
        return _abi
    try:
        data = json.loads(ABI_PATH.read_text(encoding="utf-8"))
        abi = data.get("abi") if isinstance(data, dict) else data
        if not isinstance(abi, list):
            return None
    except Exception:
        log.exception("Failed to read ABI file")
        return None
    _abi, _abi_mtime, _contract = abi, mtime, None
    _topics = {}
    for item in abi:
        if item.get("type") == "event" and item.get("name") in INDEXED_EVENTS:
            sig = f"{item['name']}({','.join(i['type'] for i in item.get('inputs', []))})"
            _topics[Web3.keccak(text=sig).hex().removeprefix("0x").lower()] = item
    return _abi


def is_configured() -> bool:
    return bool(settings.contract_address) and load_abi() is not None


def require_configured() -> None:
    if not is_configured():
        raise HTTPException(503, "Contract not configured")


def w3() -> AsyncWeb3:
    global _w3
    if _w3 is None:
        _w3 = AsyncWeb3(AsyncHTTPProvider(settings.SEPOLIA_RPC_URL, request_kwargs={"timeout": 20}))
    return _w3


def contract():
    global _contract
    require_configured()
    if _contract is None:
        _contract = w3().eth.contract(address=Web3.to_checksum_address(settings.contract_address), abi=_abi)
    return _contract


async def _cached(key: str, ttl: float, fn):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    val = await fn()
    _cache[key] = (now + ttl, val)
    return val


def invalidate_role_cache() -> None:
    for k in list(_cache):
        if k.startswith(("owner", "issuer:")):
            _cache.pop(k, None)


# ---------------------------------------------------------------- reads
async def rpc_ok() -> bool:
    if not is_configured():
        return False

    async def check():
        try:
            cid = await asyncio.wait_for(w3().eth.chain_id, 8)
            return int(cid) == settings.CHAIN_ID
        except Exception:
            return False

    return await _cached("rpc_ok", 30, check)


async def get_owner() -> str | None:
    if not is_configured():
        return None

    async def f():
        return (await asyncio.wait_for(contract().functions.owner().call(), 10)).lower()

    return await _cached("owner", 30, f)


async def is_issuer(address: str | None) -> bool:
    if not address or not is_configured():
        return False
    a = address.lower()

    async def f():
        return bool(await asyncio.wait_for(
            contract().functions.isIssuer(Web3.to_checksum_address(a)).call(), 10))

    return await _cached(f"issuer:{a}", 30, f)


async def chain_flags(address: str | None) -> tuple[bool, bool]:
    """(is_contract_owner, is_onchain_issuer). Raises on RPC failure."""
    if not address or not is_configured():
        return False, False
    owner = await get_owner()
    is_owner = owner == address.lower()
    return is_owner, (is_owner or await is_issuer(address))


async def _block_time(num: int) -> datetime | None:
    if num in _block_time_cache:
        return _block_time_cache[num]
    try:
        blk = await w3().eth.get_block(num)
        t = datetime.fromtimestamp(int(blk["timestamp"]), tz=timezone.utc)
    except Exception:
        return None
    if len(_block_time_cache) > 5000:
        _block_time_cache.clear()
    _block_time_cache[num] = t
    return t


# ---------------------------------------------------------------- decoding
def _hex(b) -> str:
    if isinstance(b, (bytes, bytearray)):
        return "0x" + bytes(b).hex()
    s = str(b)
    return s if s.startswith("0x") else "0x" + s


def _addr(v) -> str | None:
    return v.lower() if isinstance(v, str) else None


def decode_logs(logs) -> list[dict]:
    """Decode raw logs from our contract into chain_events rows (block_time filled later)."""
    load_abi()
    c = contract()
    out = []
    target = settings.contract_address
    for lg in logs:
        if (lg.get("address") or "").lower() != target:
            continue
        topics = lg.get("topics") or []
        if not topics:
            continue
        t0 = _hex(topics[0]).removeprefix("0x").lower()
        ev_abi = _topics.get(t0)
        if not ev_abi:
            continue
        name = ev_abi["name"]
        try:
            ev = c.events[name]().process_log(lg)
        except Exception:
            log.warning("Could not decode %s log", name)
            continue
        a = ev["args"]
        row = {
            "tx_hash": _hex(lg["transactionHash"]).lower(),
            "log_index": int(lg["logIndex"]),
            "block_number": int(lg["blockNumber"]),
            "block_time": None,
            "event": name,
            "from_address": None, "to_address": None, "amount": None,
            "reason": None, "item_id": None, "issuer": None,
        }
        if name == "Transfer":
            row.update(from_address=_addr(a["from"]), to_address=_addr(a["to"]), amount=int(a["value"]))
        elif name == "RewardIssued":
            row.update(issuer=_addr(a["issuer"]), to_address=_addr(a["to"]), amount=int(a["amount"]),
                       reason=str(a["reason"]))
        elif name == "Redeemed":
            row.update(from_address=_addr(a["student"]), amount=int(a["amount"]), item_id=int(a["itemId"]))
        elif name in ("IssuerAdded", "IssuerRemoved"):
            row.update(to_address=_addr(a["account"]))
        elif name == "OwnershipTransferred":
            row.update(from_address=_addr(a["previousOwner"]), to_address=_addr(a["newOwner"]))
        elif name in ("Paused", "Unpaused"):
            row.update(from_address=_addr(a["account"]))
        elif name == "MaxIssuePerTxUpdated":
            row.update(amount=int(a["newMax"]))
        out.append(row)
    return out


# ---------------------------------------------------------------- persistence
def _voucher_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


async def store_events(rows: list[dict]) -> list[dict]:
    """Upsert events; create redemptions; refresh roles. Returns redemptions created/found."""
    if not rows:
        return []
    for blk in {r["block_number"] for r in rows}:
        t = await _block_time(blk)
        for r in rows:
            if r["block_number"] == blk:
                r["block_time"] = t
    pool = await db.get_pool()
    async with pool.acquire() as con:
        await con.executemany(
            """
            insert into chain_events (tx_hash, log_index, block_number, block_time, event, from_address,
                                      to_address, amount, reason, item_id, issuer)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            on conflict (tx_hash, log_index) do update set
              block_time = coalesce(excluded.block_time, chain_events.block_time),
              block_number = excluded.block_number
            """,
            [(r["tx_hash"], r["log_index"], r["block_number"], r["block_time"], r["event"], r["from_address"],
              r["to_address"], r["amount"], r["reason"], r["item_id"], r["issuer"]) for r in rows],
        )
    redemptions = []
    for r in rows:
        if r["event"] == "Redeemed":
            red = await _create_redemption(r)
            if red:
                redemptions.append(red)
    role_addrs = {a for r in rows if r["event"] in ("IssuerAdded", "IssuerRemoved", "OwnershipTransferred")
                  for a in (r["from_address"], r["to_address"]) if a}
    if role_addrs:
        invalidate_role_cache()
        await refresh_roles(role_addrs)
    return redemptions


async def _create_redemption(ev: dict) -> dict | None:
    pool = await db.get_pool()
    async with pool.acquire() as con:
        async with con.transaction():
            item = await con.fetchrow("select id from store_items where id = $1", ev["item_id"]) \
                if ev["item_id"] is not None and ev["item_id"] < 2**31 else None
            profile_id = await con.fetchval("select id from profiles where wallet_address = $1", ev["from_address"])
            new_id = await con.fetchval(
                """
                insert into redemptions (tx_hash, profile_id, wallet_address, item_id, amount, code)
                values ($1,$2,$3,$4,$5,$6) on conflict (tx_hash) do nothing returning id
                """,
                ev["tx_hash"], profile_id, ev["from_address"], item["id"] if item else None,
                int(ev["amount"] or 0), _voucher_code(),
            )
            if new_id and item:
                await con.execute(
                    "update store_items set stock = greatest(stock - 1, 0) where id = $1 and stock is not null",
                    item["id"])
    return await get_redemption_by_tx(ev["tx_hash"])


REDEMPTION_SQL = """
select r.id, r.tx_hash, r.amount, r.status, r.code, r.created_at, r.fulfilled_at, r.profile_id, r.wallet_address,
       s.id as item_id, s.name as item_name, s.icon as item_icon,
       p.full_name as p_full_name, p.email as p_email, p.avatar_url as p_avatar_url
from redemptions r
left join store_items s on s.id = r.item_id
left join profiles p on p.id = r.profile_id
"""


def redemption_out(r: dict, with_profile: bool = False) -> dict:
    out = {
        "id": r["id"], "tx_hash": r["tx_hash"],
        "item": {"id": r["item_id"], "name": r["item_name"], "icon": r["item_icon"]} if r["item_id"] else None,
        "amount": r["amount"], "status": r["status"], "code": r["code"],
        "created_at": r["created_at"], "fulfilled_at": r["fulfilled_at"],
        "wallet_address": r["wallet_address"],
    }
    if with_profile:
        out["profile"] = ({"id": r["profile_id"], "full_name": r["p_full_name"], "email": r["p_email"],
                           "avatar_url": r["p_avatar_url"]} if r["profile_id"] else None)
    return out


async def get_redemption_by_tx(tx_hash: str) -> dict | None:
    r = await db.fetchrow(REDEMPTION_SQL + " where r.tx_hash = $1", tx_hash)
    return redemption_out(r) if r else None


async def compute_role(profile: dict) -> tuple[str, bool, bool]:
    """Returns (role, is_contract_owner, is_onchain_issuer). Keeps cached role on RPC failure."""
    email_admin = (profile.get("email") or "").lower() in settings.admin_emails
    wallet = profile.get("wallet_address")
    if not is_configured():
        return ("admin" if email_admin else "student"), False, False
    try:
        is_owner, is_iss = await chain_flags(wallet)
    except Exception:
        log.warning("RPC failure computing role; keeping cached role")
        cached = profile.get("role") or "student"
        return ("admin" if email_admin else cached), False, cached in ("issuer", "admin") and not email_admin
    if email_admin or is_owner:
        role = "admin"
    elif is_iss:
        role = "issuer"
    else:
        role = "student"
    return role, is_owner, is_iss


async def refresh_roles(addresses: set[str]) -> None:
    profiles = await db.fetch("select * from profiles where wallet_address = any($1::text[])", list(addresses))
    for p in profiles:
        try:
            role, _, _ = await compute_role(p)
            if role != p["role"]:
                await db.execute("update profiles set role=$2, updated_at=now() where id=$1", p["id"], role)
        except Exception:
            log.exception("role refresh failed")


# ---------------------------------------------------------------- receipts
async def record_tx(tx_hash: str, timeout: float = 90) -> tuple[str, list[dict], list[dict]]:
    require_configured()
    deadline = time.monotonic() + timeout
    receipt = None
    while True:
        try:
            receipt = await asyncio.wait_for(w3().eth.get_transaction_receipt(tx_hash), 15)
        except Exception:
            receipt = None
        if receipt is not None or time.monotonic() >= deadline:
            break
        await asyncio.sleep(2.5)
    if receipt is None:
        raise HTTPException(504, "Transaction receipt not available yet; try again shortly")
    if int(receipt["status"]) != 1:
        return "failed", [], []
    rows = decode_logs(receipt["logs"])
    reds = await store_events(rows)
    return "confirmed", rows, reds


# ---------------------------------------------------------------- sync
def _sync_key() -> str:
    return f"events:{settings.contract_address}"


async def sync_events(budget_s: float = 20.0) -> dict:
    """Index contract logs from sync_state.last_block forward. Lock-protected, time-budgeted."""
    require_configured()
    async with _sync_lock:
        started = time.monotonic()
        latest = int(await asyncio.wait_for(w3().eth.block_number, 15))
        last = await db.fetchval("select last_block from sync_state where key=$1", _sync_key())
        if last is None:
            start = settings.CONTRACT_DEPLOY_BLOCK
            if start <= 0:
                start = max(0, latest - 10_000)
                log.warning("CONTRACT_DEPLOY_BLOCK unset; starting sync at %s", start)
        else:
            start = int(last) + 1
        from_block, cur, chunk, total = start, start, 5000, 0
        address = Web3.to_checksum_address(settings.contract_address)
        while cur <= latest and time.monotonic() - started < budget_s:
            end = min(cur + chunk - 1, latest)
            try:
                logs = await asyncio.wait_for(
                    w3().eth.get_logs({"address": address, "fromBlock": cur, "toBlock": end}), 20)
            except Exception as e:
                if chunk <= 10:
                    log.warning("get_logs failing even at chunk=%s: %s", chunk, type(e).__name__)
                    break
                chunk = max(10, chunk // 2)
                continue
            rows = decode_logs(logs)
            if rows:
                await store_events(rows)
                total += len(rows)
            await db.execute(
                """insert into sync_state (key, last_block, updated_at) values ($1,$2,now())
                   on conflict (key) do update set last_block=excluded.last_block, updated_at=now()""",
                _sync_key(), end)
            cur = end + 1
        return {"from_block": from_block, "to_block": cur - 1, "events_indexed": total}


async def _bg_sync():
    try:
        r = await sync_events()
        if r["events_indexed"]:
            log.info("background sync: %s", r)
    except Exception as e:
        log.warning("background sync failed: %s", type(e).__name__)


def trigger_sync(force: bool = False) -> bool:
    """Fire-and-forget throttled sync (≥60 s apart). Never blocks the request."""
    global _last_sync_trigger
    if not is_configured() or _sync_lock.locked():
        return False
    now = time.monotonic()
    if not force and now - _last_sync_trigger < 60:
        return False
    _last_sync_trigger = now
    t = asyncio.create_task(_bg_sync())
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return True


ZERO = ZERO_ADDRESS
