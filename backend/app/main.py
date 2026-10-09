import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import auth, chain, db
from .config import settings
from .routers import activity, admin, catalog, me, public

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("crp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    if chain.is_configured():
        chain.trigger_sync(force=True)  # background; Render free tier sleeps, so sync on every wake
    else:
        log.warning("Contract not configured (CONTRACT_ADDRESS or ABI missing); chain features disabled")
    yield
    await auth.close_http()
    await db.close_pool()


app = FastAPI(title="CampusCoin API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exc(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exc(request: Request, exc: RequestValidationError):
    parts = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body", "query", "path"))
        parts.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
    return JSONResponse({"detail": "; ".join(parts) or "Invalid request"}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_exc(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


for r in (public.router, me.router, catalog.router, activity.router, admin.router):
    app.include_router(r)


@app.get("/")
async def root():
    return {"name": "CampusCoin API", "health": "/api/health", "docs": "/docs"}
