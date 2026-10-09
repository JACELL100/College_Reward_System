import asyncio
import logging
from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException

from .config import settings

log = logging.getLogger("crp.db")

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool | None:
    global _pool
    if _pool is not None:
        return _pool
    if not settings.DATABASE_URL:
        log.warning("DATABASE_URL not set; database disabled")
        return None
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=1,
            max_size=5,
            # Required for Supabase's pgbouncer/Supavisor transaction pooler (port 6543)
            statement_cache_size=0,
            command_timeout=30,
            max_inactive_connection_lifetime=120,
            timeout=15,
        )
        log.info("DB pool created")
    except Exception as e:  # pragma: no cover
        log.error("Failed to create DB pool: %s", type(e).__name__)
        _pool = None
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_pool() -> asyncpg.Pool:
    pool = _pool or await init_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return pool


async def db_ok() -> bool:
    try:
        pool = await get_pool()
        async with pool.acquire() as con:
            return (await asyncio.wait_for(con.fetchval("select 1"), 5)) == 1
    except Exception:
        return False


def conv(v: Any) -> Any:
    if isinstance(v, Decimal):
        return int(v)
    return v


def row_dict(row: asyncpg.Record | None) -> dict | None:
    if row is None:
        return None
    return {k: conv(v) for k, v in row.items()}


async def fetch(sql: str, *args) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(sql, *args)
    return [row_dict(r) for r in rows]


async def fetchrow(sql: str, *args) -> dict | None:
    pool = await get_pool()
    return row_dict(await pool.fetchrow(sql, *args))


async def fetchval(sql: str, *args) -> Any:
    pool = await get_pool()
    return conv(await pool.fetchval(sql, *args))


async def execute(sql: str, *args) -> str:
    pool = await get_pool()
    return await pool.execute(sql, *args)
