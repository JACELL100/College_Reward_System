"""Compile contracts/CollegeRewardPoints.sol with solc (via py-solc-x).

Outputs:
  blockchain/build/CollegeRewardPoints.json   {contractName, abi, bytecode, compiler}
  backend/app/abi/CollegeRewardPoints.json    ABI array only (consumed by the backend)

Usage:  python compile.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import solcx
from packaging.version import Version

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SOURCE = ROOT / "contracts" / "CollegeRewardPoints.sol"
BUILD_FILE = HERE / "build" / "CollegeRewardPoints.json"
BACKEND_ABI = ROOT / "backend" / "app" / "abi" / "CollegeRewardPoints.json"
CONTRACT_NAME = "CollegeRewardPoints"
PREFERRED_SOLC = Version("0.8.24")
EVM_VERSION = "paris"  # no PUSH0 opcode -> works on every EVM tool / testnet


def ensure_solc() -> Version:
    """Install (once) and select solc 0.8.24, or the closest 0.8.x >= 0.8.24."""
    installed = solcx.get_installed_solc_versions()
    if PREFERRED_SOLC in installed:
        version = PREFERRED_SOLC
    else:
        try:
            solcx.install_solc(str(PREFERRED_SOLC))
            version = PREFERRED_SOLC
        except Exception:  # pragma: no cover - fallback path
            candidates = sorted(
                v for v in solcx.get_installable_solc_versions()
                if v.major == 0 and v.minor == 8 and v >= PREFERRED_SOLC
            )
            if not candidates:
                sys.exit("No suitable solc 0.8.x >= 0.8.24 available to install.")
            version = candidates[0]
            solcx.install_solc(str(version))
    solcx.set_solc_version(str(version))
    return version


def compile_contract() -> dict:
    version = ensure_solc()
    standard_input = {
        "language": "Solidity",
        "sources": {SOURCE.name: {"content": SOURCE.read_text(encoding="utf-8")}},
        "settings": {
            "optimizer": {"enabled": True, "runs": 200},
            "evmVersion": EVM_VERSION,
            "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object"]}},
        },
    }
    output = solcx.compile_standard(standard_input, solc_version=str(version))

    errors = [e for e in output.get("errors", []) if e.get("severity") == "error"]
    if errors:
        for e in errors:
            print(e.get("formattedMessage", e), file=sys.stderr)
        sys.exit("Compilation failed.")
    for w in output.get("errors", []):
        print("warning:", w.get("formattedMessage", w).strip(), file=sys.stderr)

    contract = output["contracts"][SOURCE.name][CONTRACT_NAME]
    artifact = {
        "contractName": CONTRACT_NAME,
        "abi": contract["abi"],
        "bytecode": "0x" + contract["evm"]["bytecode"]["object"],
        "compiler": {
            "solc": str(version),
            "optimizer": {"enabled": True, "runs": 200},
            "evmVersion": EVM_VERSION,
        },
    }

    BUILD_FILE.parent.mkdir(parents=True, exist_ok=True)
    BUILD_FILE.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    BACKEND_ABI.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_ABI.write_text(json.dumps(artifact["abi"], indent=2), encoding="utf-8")

    size = (len(artifact["bytecode"]) - 2) // 2
    print(f"Compiled {CONTRACT_NAME} with solc {version} (optimizer 200 runs, evm {EVM_VERSION})")
    print(f"  bytecode size : {size} bytes")
    print(f"  artifact      : {BUILD_FILE.relative_to(ROOT)}")
    print(f"  backend ABI   : {BACKEND_ABI.relative_to(ROOT)}")
    return artifact


def load_artifact(force: bool = False) -> dict:
    """Return the build artifact, compiling first if it is missing (or force=True)."""
    if force or not BUILD_FILE.exists():
        return compile_contract()
    return json.loads(BUILD_FILE.read_text(encoding="utf-8"))


if __name__ == "__main__":
    compile_contract()
