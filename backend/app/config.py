from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    FRONTEND_ORIGINS: str = "http://localhost:3000"
    ADMIN_EMAILS: str = ""

    SEPOLIA_RPC_URL: str = "https://ethereum-sepolia-rpc.publicnode.com"
    CHAIN_ID: int = 11155111
    CONTRACT_ADDRESS: str = ""
    CONTRACT_DEPLOY_BLOCK: int = 0
    EXPLORER_URL: str = "https://sepolia.etherscan.io"

    GAS_DRIP_PRIVATE_KEY: str = ""
    GAS_DRIP_AMOUNT_ETH: float = 0.005
    GAS_DRIP_MIN_BALANCE_ETH: float = 0.002

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def contract_address(self) -> str | None:
        a = self.CONTRACT_ADDRESS.strip().lower()
        return a or None

    @property
    def supabase_url(self) -> str:
        return self.SUPABASE_URL.strip().rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
