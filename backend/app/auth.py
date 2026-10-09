"""Supabase access-token verification + profile upsert."""
import asyncio
import json
import logging
import time
import uuid

import httpx
import jwt
from fastapi import Depends, Header, HTTPException

from . import db
from .config import settings

log = logging.getLogger("crp.auth")

_JWKS_TTL = 600
_jwks: dict = {"keys": {}, "fetched": 0.0}
_jwks_lock = asyncio.Lock()
_user_cache: dict[str, tuple[float, dict]] = {}  # token -> (expires, claims)
_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0))
    return _http


async def close_http() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


async def _load_jwks(force: bool = False) -> dict:
    now = time.time()
    if not force and _jwks["keys"] and now - _jwks["fetched"] < _JWKS_TTL:
        return _jwks["keys"]
    async with _jwks_lock:
        if not force and _jwks["keys"] and time.time() - _jwks["fetched"] < _JWKS_TTL:
            return _jwks["keys"]
        if force and time.time() - _jwks["fetched"] < 30:
            return _jwks["keys"]  # avoid hammering on unknown kid
        url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        r = await http().get(url)
        r.raise_for_status()
        keys = {}
        for k in r.json().get("keys", []):
            try:
                keys[k.get("kid")] = jwt.PyJWK.from_dict(k)
            except Exception:
                continue
        _jwks["keys"] = keys
        _jwks["fetched"] = time.time()
        return keys


async def _verify_jwks(token: str, header: dict) -> dict:
    kid = header.get("kid")
    keys = await _load_jwks()
    key = keys.get(kid) or (None if kid else next(iter(keys.values()), None))
    if key is None:
        keys = await _load_jwks(force=True)
        key = keys.get(kid)
    if key is None:
        raise HTTPException(401, "Unknown token signing key")
    return jwt.decode(token, key.key, algorithms=[header["alg"]], audience="authenticated", leeway=30)


async def _verify_remote(token: str) -> dict:
    now = time.time()
    hit = _user_cache.get(token)
    if hit and hit[0] > now:
        return hit[1]
    headers = {"Authorization": f"Bearer {token}"}
    if settings.SUPABASE_ANON_KEY:
        headers["apikey"] = settings.SUPABASE_ANON_KEY
    try:
        r = await http().get(f"{settings.supabase_url}/auth/v1/user", headers=headers)
    except httpx.HTTPError:
        raise HTTPException(503, "Auth service unreachable")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired token")
    u = r.json()
    claims = {"sub": u.get("id"), "email": u.get("email"), "user_metadata": u.get("user_metadata") or {}}
    if len(_user_cache) > 2000:
        _user_cache.clear()
    _user_cache[token] = (now + 60, claims)
    return claims


async def verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Malformed token")
    alg = header.get("alg", "")
    try:
        if alg in ("ES256", "RS256", "EdDSA") and settings.supabase_url:
            try:
                return await _verify_jwks(token, header)
            except httpx.HTTPError:
                log.warning("JWKS fetch failed; falling back to /auth/v1/user")
                return await _verify_remote(token)
        if alg == "HS256" and settings.SUPABASE_JWT_SECRET:
            return jwt.decode(token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"],
                              audience="authenticated", leeway=30)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    return await _verify_remote(token)


async def upsert_profile(claims: dict) -> dict:
    sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    try:
        uid = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(401, "Token has no valid subject")
    if not email:
        raise HTTPException(401, "Token has no email")
    md = claims.get("user_metadata") or {}
    if isinstance(md, str):
        try:
            md = json.loads(md)
        except ValueError:
            md = {}
    full_name = md.get("full_name") or md.get("name")
    avatar = md.get("avatar_url") or md.get("picture")
    role = "admin" if email in settings.admin_emails else "student"
    row = await db.fetchrow(
        """
        insert into profiles (id, email, full_name, avatar_url, role)
        values ($1, $2, $3, $4, $5)
        on conflict (id) do update set
          email = excluded.email,
          full_name = coalesce(profiles.full_name, excluded.full_name),
          avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url)
        returning *
        """,
        uid, email, full_name, avatar, role,
    )
    return row


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Missing bearer token")
    claims = await verify_token(token)
    return await upsert_profile(claims)


def effective_role(profile: dict) -> str:
    if (profile.get("email") or "").lower() in settings.admin_emails:
        return "admin"
    return profile.get("role") or "student"


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if effective_role(user) not in ("issuer", "admin"):
        raise HTTPException(403, "Issuer or admin role required")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if effective_role(user) != "admin":
        raise HTTPException(403, "Admin role required")
    return user
