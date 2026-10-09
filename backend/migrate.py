"""Apply schema.sql to the database in DATABASE_URL (idempotent).

Usage:  python migrate.py
"""
import asyncio
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv
import os

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

TABLES = ["profiles", "reward_categories", "store_items", "chain_events", "tx_meta", "redemptions", "sync_state"]


async def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    sql = (HERE / "schema.sql").read_text(encoding="utf-8")
    con = await asyncpg.connect(dsn, statement_cache_size=0, timeout=20)
    try:
        async with con.transaction():
            await con.execute(sql)
        rows = await con.fetch(
            "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace "
            "where n.nspname='public' and c.relkind='r' and c.relname = any($1::text[]) order by 1",
            TABLES,
        )
        found = {r["relname"]: r["relrowsecurity"] for r in rows}
        for t in TABLES:
            if t not in found:
                print(f"  MISSING  {t}")
                continue
            n = await con.fetchval(f"select count(*) from {t}")
            print(f"  ok  {t:<18} rows={n:<5} rls={'on' if found[t] else 'OFF'}")
        missing = [t for t in TABLES if t not in found]
        print("Migration complete." if not missing else f"Missing tables: {missing}")
        return 0 if not missing else 2
    finally:
        await con.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
