"""Groq (OpenAI-compatible) helpers: reward suggestion + grounded chat assistant."""
import difflib
import json
import logging

import httpx
from fastapi import HTTPException

from .config import settings

log = logging.getLogger("crp.ai")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def require_ai() -> None:
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "AI not configured")


async def _complete(messages: list[dict], json_mode: bool = False, temperature: float = 0.4,
                    max_tokens: int = 700) -> str:
    require_ai()
    body = {"model": settings.GROQ_MODEL, "messages": messages, "temperature": temperature,
            "max_tokens": max_tokens}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(GROQ_URL, json=body, headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"})
    except httpx.HTTPError:
        raise HTTPException(502, "AI service unreachable")
    if r.status_code == 429:
        raise HTTPException(429, "AI rate limit reached; try again in a moment")
    if r.status_code != 200:
        log.warning("Groq error %s: %s", r.status_code, r.text[:300])
        raise HTTPException(502, "AI service error")
    return r.json()["choices"][0]["message"]["content"] or ""


async def suggest_reward(description: str, categories: list[dict]) -> dict:
    if not categories:
        raise HTTPException(400, "No active reward categories")
    cat_lines = "\n".join(f'- id={c["id"]} name="{c["name"]}" default_points={c["default_points"]}'
                          f' ({c.get("description") or ""})' for c in categories)
    system = (
        "You help college faculty at FRCRCE award 'College Reward Points' (CRP tokens) to students. "
        "Given a description of a student's achievement, pick the best matching category and a fair point value. "
        "Use the category's default_points as a baseline; scale up for exceptional/large-scale achievements "
        "(e.g. national level, first place) and down for minor ones. Points must be an integer 1-1000. "
        "Write a concise on-chain reason (max 90 characters, no emojis, no quotes) and a one-sentence rationale.\n"
        f"Categories:\n{cat_lines}\n"
        'Respond ONLY with JSON: {"category_id": int, "points": int, "reason": str, "rationale": str}'
    )
    content = await _complete(
        [{"role": "system", "content": system}, {"role": "user", "content": description[:2000]}],
        json_mode=True, temperature=0.2, max_tokens=300)
    try:
        data = json.loads(content)
    except ValueError:
        raise HTTPException(502, "AI returned invalid JSON")
    by_id = {c["id"]: c for c in categories}
    cat = None
    try:
        cat = by_id.get(int(data.get("category_id")))
    except (TypeError, ValueError):
        pass
    if cat is None:
        guess = str(data.get("category_name") or data.get("category") or "")
        names = {c["name"].lower(): c for c in categories}
        m = difflib.get_close_matches(guess.lower(), list(names), n=1, cutoff=0.3) if guess else []
        cat = names[m[0]] if m else categories[0]
    try:
        points = int(round(float(data.get("points"))))
    except (TypeError, ValueError):
        points = int(cat["default_points"])
    points = max(1, min(1000, points))
    reason = " ".join(str(data.get("reason") or cat["name"]).split()).strip().strip('"')
    if len(reason) > 90:
        reason = reason[:87].rstrip() + "..."
    while len(reason.encode("utf-8")) > 90:  # contract limit is 96 bytes
        reason = reason[:-1]
    return {"category_id": cat["id"], "category_name": cat["name"], "points": points,
            "reason": reason or cat["name"], "rationale": str(data.get("rationale") or "")[:400]}


KNOWLEDGE = """
## About CampusCoin / CRP
- CRP ("College Reward Points") is an ERC-20 token on the Ethereum **Sepolia testnet** (chainId 11155111), decimals = 0 (whole points).
- Faculty (issuers) mint CRP to students for achievements via `issueReward(to, amount, reason)` or `batchIssueReward(recipients, amounts, reason)` (max 50 recipients, max 1000 per recipient per tx, reason ≤ 96 bytes).
- Students can `transfer(to, amount)` CRP to peers, or `redeem(amount, itemId)` to burn CRP for a store item (canteen voucher, hoodie, fest pass…). Redemption gives an 8-character voucher code shown in the app; an admin marks it fulfilled.
- The contract owner (admin) can `addIssuer`/`removeIssuer`, `pause`/`unpause`, `setMaxIssuePerTx`, `transferOwnership`. When paused, minting, transfers and redemptions are blocked.
- Events: Transfer, RewardIssued, Redeemed, IssuerAdded, IssuerRemoved, OwnershipTransferred, Paused, Unpaused.
## Ethereum basics
- **Account**: an address (0x…, 20 bytes). Externally owned accounts (EOAs, like MetaMask) are controlled by a private key; contract accounts are controlled by code.
- **Transaction**: a signed message from an EOA that changes state (send ETH, call a contract). It gets mined into a block and has a hash you can view on sepolia.etherscan.io.
- **Gas**: the fee for computation, paid in ETH (Sepolia ETH is free test ETH from faucets). Fee ≈ gas used × gas price (EIP-1559: base fee + priority tip). Reading data (view calls) is free.
- **EVM**: the Ethereum Virtual Machine that runs smart-contract bytecode identically on every node.
- **Nodes**: computers running Ethereum client software that validate and store the chain; apps talk to them via RPC.
- **Sepolia**: Ethereum's main public test network — same rules as mainnet, but the ETH has no real value.
- **MetaMask**: a browser wallet that holds your keys, signs transactions and lets you switch to Sepolia. Never share your seed phrase.
- **ERC-20**: the standard token interface (balanceOf, transfer, approve, transferFrom, allowance, totalSupply).
"""


def _fmt_activity(a: dict, wallet: str | None) -> str:
    amt = a.get("amount")
    t = a.get("type")
    when = a.get("block_time")
    when = when.strftime("%Y-%m-%d") if hasattr(when, "strftime") else (when or "")
    if t == "issue":
        s = f"received {amt} CRP reward" + (f" for '{a['reason']}'" if a.get("reason") else "")
    elif t == "redeem":
        s = f"redeemed {amt} CRP (item #{a.get('item_id')})"
    else:
        inbound = wallet and a.get("to_address") == wallet
        other = (a.get("from_profile") if inbound else a.get("to_profile")) or {}
        who = other.get("full_name") or (a.get("from_address") if inbound else a.get("to_address"))
        s = f"{'received' if inbound else 'sent'} {amt} CRP {'from' if inbound else 'to'} {who}"
    return f"- {when}: {s}"


async def chat(messages: list[dict], ctx: dict) -> str:
    user = ctx["user"]
    lines = [
        "You are CampusCoin Assistant for FRCRCE (Fr. Conceicao Rodrigues College of Engineering, Bandra). "
        "Help students and faculty understand their College Reward Points, how to earn and redeem them, and "
        "the blockchain concepts behind them. Be friendly and concise (usually under 150 words). Markdown is allowed. "
        "Only state facts about the user's account that appear below; if unsure, say so. Never ask for private keys "
        "or seed phrases. Users perform transactions themselves in the app with MetaMask — you cannot send tokens.",
        "",
        "## Current user",
        f"- Name: {user.get('full_name') or 'unknown'}; role: {user.get('role')}",
        f"- Wallet: {user.get('wallet_address') or 'not linked yet (link MetaMask on the Wallet page)'}",
        f"- CRP balance: {ctx.get('balance', 0)}; total earned: {ctx.get('earned', 0)}; "
        f"leaderboard rank: {ctx.get('rank') or 'unranked'}",
        "## Recent activity (latest first)",
        *([_fmt_activity(a, user.get("wallet_address")) for a in ctx.get("activity", [])] or ["- none yet"]),
        "## Store items (cost in CRP)",
        *[f"- #{s['id']} {s['name']}: {s['cost']} CRP" + (f" (stock {s['stock']})" if s.get("stock") is not None else "")
          for s in ctx.get("store", [])],
        "## Reward categories (typical points)",
        *[f"- {c['name']}: ~{c['default_points']} CRP" for c in ctx.get("categories", [])],
        KNOWLEDGE,
    ]
    convo = []
    for m in messages[-12:]:
        role = m.get("role")
        content = str(m.get("content") or "")[:4000]
        if role in ("user", "assistant") and content.strip():
            convo.append({"role": role, "content": content})
    if not convo or convo[-1]["role"] != "user":
        raise HTTPException(400, "Last message must be from the user")
    return (await _complete([{"role": "system", "content": "\n".join(lines)}, *convo],
                            temperature=0.5, max_tokens=700)).strip()
