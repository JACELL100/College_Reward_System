"""Email/password sign-up.

Supabase's built-in mailer on the free tier is heavily rate-limited, so relying on
confirmation emails would lock most students out. Instead the backend creates the
user through the Supabase Admin API (service-role key, server-side only) with the
email already confirmed; the frontend then signs in with signInWithPassword.
"""
import logging
import re
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import http
from app.config import settings

log = logging.getLogger("crp.signup")
router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PER_IP_LIMIT, PER_IP_WINDOW = 5, 3600     # 5 sign-ups per IP per hour
GLOBAL_LIMIT, GLOBAL_WINDOW = 100, 3600   # overall ceiling per hour
_hits: dict[str, deque] = defaultdict(deque)


class SignupBody(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=72)  # bcrypt limit used by Supabase Auth
    full_name: str = Field(max_length=80)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _rate_limit(key: str, limit: int, window: int) -> None:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many sign-ups, please try again later")
    q.append(now)


def password_problem(pw: str) -> str | None:
    if len(pw) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        return "Password must contain at least one letter and one number"
    return None


@router.get("/config")
async def auth_config():
    """Tells the frontend whether server-side (instant) sign-up is available."""
    return {"instant_signup": bool(settings.SUPABASE_SERVICE_ROLE_KEY and settings.SUPABASE_URL)}


@router.post("/signup", status_code=201)
async def signup(body: SignupBody, request: Request):
    if not settings.SUPABASE_SERVICE_ROLE_KEY or not settings.SUPABASE_URL:
        raise HTTPException(503, "Instant sign-up is not configured")
    email = body.email.strip().lower()
    name = " ".join(body.full_name.split())
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if len(name) < 2:
        raise HTTPException(422, "Enter your full name")
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)

    _rate_limit(f"ip:{_client_ip(request)}", PER_IP_LIMIT, PER_IP_WINDOW)
    _rate_limit("global", GLOBAL_LIMIT, GLOBAL_WINDOW)

    key = settings.SUPABASE_SERVICE_ROLE_KEY
    try:
        r = await http().post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            json={"email": email, "password": body.password, "email_confirm": True,
                  "user_metadata": {"full_name": name}},
            timeout=20,
        )
    except Exception as e:
        log.warning("signup request failed: %s", type(e).__name__)
        raise HTTPException(502, "Could not reach the auth service")

    if r.status_code in (200, 201):
        return {"ok": True, "email": email}
    try:
        err = r.json()
    except ValueError:
        err = {}
    msg = str(err.get("msg") or err.get("message") or err.get("error_description") or "")
    code = str(err.get("error_code") or err.get("code") or "")
    if r.status_code == 422 and ("already" in msg.lower() or code == "email_exists"):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    if code == "weak_password" or "password" in msg.lower():
        raise HTTPException(422, msg or "Password is too weak")
    log.warning("signup rejected by auth service: %s %s", r.status_code, code)
    raise HTTPException(400, msg or "Sign-up failed")
