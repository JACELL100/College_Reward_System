import asyncio
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

import asyncpg
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from web3 import Web3

from .. import chain, db, queries
from ..auth import get_current_user
from ..config import settings

log = logging.getLogger("crp.me")
router = APIRouter(prefix="/api", tags=["me"])


async def build_profile(p: dict) -> dict:
    """Recompute role from chain (cached), persist if changed, return Profile object."""
    role, is_owner, is_iss = await chain.compute_role(p)
    if role != p.get("role"):
        p = await db.fetchrow("update profiles set role=$2, updated_at=now() where id=$1 returning *", p["id"], role)
    return queries.profile_out(p, is_owner, is_iss)


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return await build_profile(user)


class MePatch(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    department: str | None = Field(default=None, max_length=100)
    roll_no: str | None = Field(default=None, max_length=32)


@router.patch("/me")
async def patch_me(body: MePatch, user: dict = Depends(get_current_user)):
    fields = {k: (v.strip() or None) if isinstance(v, str) else v
              for k, v in body.model_dump(exclude_unset=True).items()}
    if fields:
        sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
        user = await db.fetchrow(f"update profiles set {sets}, updated_at=now() where id=$1 returning *",
                                 user["id"], *fields.values())
    return await build_profile(user)


# ---------------------------------------------------------------- wallet linking
@router.get("/wallet/link-message")
async def link_message(user: dict = Depends(get_current_user)):
    issued = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    msg = (
        "CampusCoin (FRCRCE) - Link wallet\n"
        "Sign this message to link this wallet to your CampusCoin account. This does not cost gas.\n\n"
        f"User ID: {user['id']}\n"
        f"Email: {user['email']}\n"
        f"Issued At: {issued}\n"
        f"Nonce: {secrets.token_hex(16)}"
    )
    return {"message": msg}


class LinkBody(BaseModel):
    address: str
    message: str = Field(max_length=2000)
    signature: str = Field(max_length=200)


@router.post("/wallet/link")
async def link_wallet(body: LinkBody, user: dict = Depends(get_current_user)):
    address = queries.norm_address(body.address)
    m_uid = re.search(r"^User ID: (.+)$", body.message, re.M)
    m_at = re.search(r"^Issued At: (.+)$", body.message, re.M)
    if not m_uid or not m_at:
        raise HTTPException(400, "Malformed link message")
    if m_uid.group(1).strip() != str(user["id"]):
        raise HTTPException(400, "Message was issued for a different user")
    try:
        issued = datetime.fromisoformat(m_at.group(1).strip().replace("Z", "+00:00"))
        if issued.tzinfo is None:
            issued = issued.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Malformed Issued At")
    now = datetime.now(timezone.utc)
    if issued < now - timedelta(minutes=10) or issued > now + timedelta(minutes=2):
        raise HTTPException(400, "Link message expired; request a new one")
    try:
        signer = Account.recover_message(encode_defunct(text=body.message), signature=body.signature).lower()
    except Exception:
        raise HTTPException(400, "Invalid signature")
    if signer != address:
        raise HTTPException(400, "Signature does not match address")
    other = await db.fetchval("select id from profiles where wallet_address=$1 and id<>$2", address, user["id"])
    if other:
        raise HTTPException(409, "This wallet is already linked to another account")
    try:
        user = await db.fetchrow("update profiles set wallet_address=$2, updated_at=now() where id=$1 returning *",
                                 user["id"], address)
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "This wallet is already linked to another account")
    await db.execute("update redemptions set profile_id=$1 where wallet_address=$2 and profile_id is null",
                     user["id"], address)
    return await build_profile(user)


@router.delete("/wallet/link")
async def unlink_wallet(user: dict = Depends(get_current_user)):
    user = await db.fetchrow("update profiles set wallet_address=null, updated_at=now() where id=$1 returning *",
                             user["id"])
    return await build_profile(user)


# ---------------------------------------------------------------- gas drip
_drip_lock = asyncio.Lock()


def _drip_enabled() -> bool:
    return bool(settings.GAS_DRIP_PRIVATE_KEY and settings.SEPOLIA_RPC_URL)


async def _eth_balance(addr: str) -> float:
    wei = await asyncio.wait_for(chain.w3().eth.get_balance(Web3.to_checksum_address(addr)), 10)
    return wei / 1e18


@router.get("/wallet/gas-drip/status")
async def gas_drip_status(user: dict = Depends(get_current_user)):
    out = {"enabled": _drip_enabled(), "eligible": False, "amount_eth": settings.GAS_DRIP_AMOUNT_ETH}
    if not out["enabled"]:
        return {**out, "reason": "Gas drip is not enabled"}
    if not user.get("wallet_address"):
        return {**out, "reason": "Link a wallet first"}
    if user.get("gas_dripped_at"):
        return {**out, "reason": "Already received a gas drip"}
    try:
        if await _eth_balance(user["wallet_address"]) >= settings.GAS_DRIP_MIN_BALANCE_ETH:
            return {**out, "reason": "Wallet already has enough Sepolia ETH"}
    except Exception:
        return {**out, "reason": "Could not check wallet balance"}
    return {**out, "eligible": True}


@router.post("/wallet/gas-drip")
async def gas_drip(user: dict = Depends(get_current_user)):
    if not _drip_enabled():
        raise HTTPException(503, "Gas drip is not enabled")
    wallet = user.get("wallet_address")
    if not wallet:
        raise HTTPException(400, "Link a wallet first")
    try:
        bal = await _eth_balance(wallet)
    except Exception:
        raise HTTPException(502, "Blockchain RPC error")
    if bal >= settings.GAS_DRIP_MIN_BALANCE_ETH:
        raise HTTPException(400, "Wallet already has enough Sepolia ETH")
    claimed = await db.fetchval(
        "update profiles set gas_dripped_at=now() where id=$1 and gas_dripped_at is null returning id", user["id"])
    if not claimed:
        raise HTTPException(409, "Already received a gas drip")
    try:
        async with _drip_lock:
            w3 = chain.w3()
            acct = Account.from_key(settings.GAS_DRIP_PRIVATE_KEY)
            value = Web3.to_wei(settings.GAS_DRIP_AMOUNT_ETH, "ether")
            if await w3.eth.get_balance(acct.address) < value + Web3.to_wei(0.0005, "ether"):
                raise HTTPException(503, "Gas faucet is empty")
            latest = await w3.eth.get_block("latest")
            base = int(latest.get("baseFeePerGas") or Web3.to_wei(1, "gwei"))
            try:
                tip = int(await w3.eth.max_priority_fee)
            except Exception:
                tip = Web3.to_wei(1.5, "gwei")
            tx = {
                "type": 2, "chainId": settings.CHAIN_ID, "to": Web3.to_checksum_address(wallet), "value": value,
                "maxPriorityFeePerGas": tip, "maxFeePerGas": base * 2 + tip,
                "nonce": await w3.eth.get_transaction_count(acct.address, "pending"),
            }
            # Don't hard-code 21000: sending ETH to a brand-new account costs extra
            # state-creation gas on current Sepolia, and a 21000 limit reverts.
            try:
                est = await w3.eth.estimate_gas({"from": acct.address, "to": tx["to"], "value": value})
            except Exception:
                est = 60_000
            tx["gas"] = int(est * 1.3)
            signed = acct.sign_transaction(tx)
            h = await w3.eth.send_raw_transaction(signed.raw_transaction)
    except Exception as e:
        await db.execute("update profiles set gas_dripped_at=null where id=$1", user["id"])
        if isinstance(e, HTTPException):
            raise
        log.warning("gas drip failed: %s", type(e).__name__)
        raise HTTPException(502, "Failed to send gas drip")
    return {"tx_hash": "0x" + bytes(h).hex().removeprefix("0x"), "amount_eth": settings.GAS_DRIP_AMOUNT_ETH}


# ---------------------------------------------------------------- directory
def email_hint(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:2]}***@{domain}"


@router.get("/directory")
async def directory(q: str = Query(default="", max_length=100), user: dict = Depends(get_current_user)):
    like = f"%{q.strip()}%"
    rows = await db.fetch(
        """select id, full_name, avatar_url, department, role, wallet_address, email from profiles
           where id <> $1
             and ($2 = '%%' or full_name ilike $2 or email ilike $2 or roll_no ilike $2
                  or department ilike $2 or wallet_address ilike $2)
           -- people who haven't linked a wallet are still listed (UI shows them as not yet payable)
           order by (wallet_address is null), full_name nulls last limit 20""",
        user["id"], like)
    return [{"id": r["id"], "full_name": r["full_name"], "avatar_url": r["avatar_url"],
             "department": r["department"], "role": r["role"], "wallet_address": r["wallet_address"],
             "email_hint": email_hint(r["email"])} for r in rows]
