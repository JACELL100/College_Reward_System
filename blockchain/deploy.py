"""Deploy CollegeRewardPoints to Sepolia with web3.py.

Reads blockchain/.env:
  SEPOLIA_RPC_URL       e.g. https://ethereum-sepolia-rpc.publicnode.com
  CHAIN_ID              11155111
  DEPLOYER_PRIVATE_KEY  0x... (MetaMask account funded with Sepolia ETH; becomes owner)

The transaction is signed LOCALLY - the private key never leaves this machine.
Writes blockchain/deployments/sepolia.json.

Usage:  python deploy.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

from compile import load_artifact

HERE = Path(__file__).resolve().parent
DEPLOYMENT_FILE = HERE / "deployments" / "sepolia.json"
SEPOLIA_CHAIN_ID = 11155111
EXPLORER = "https://sepolia.etherscan.io"
DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com"
MIN_BALANCE_ETH = 0.005


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def load_config() -> tuple[str, int, str]:
    load_dotenv(HERE / ".env")
    rpc = os.getenv("SEPOLIA_RPC_URL") or DEFAULT_RPC
    chain_id = int(os.getenv("CHAIN_ID") or SEPOLIA_CHAIN_ID)
    key = (os.getenv("DEPLOYER_PRIVATE_KEY") or "").strip()
    if not key:
        fail("DEPLOYER_PRIVATE_KEY is empty in blockchain/.env.\n"
             "  1. In MetaMask: account menu -> Account details -> Show private key.\n"
             "  2. Paste it as DEPLOYER_PRIVATE_KEY=0x... in blockchain/.env (never commit this file).\n"
             "  3. Fund the account with Sepolia ETH from a faucet (see README.md).")
    if not key.startswith("0x"):
        key = "0x" + key
    if len(key) != 66:
        fail("DEPLOYER_PRIVATE_KEY does not look like a 32-byte hex key (expected 64 hex chars).")
    return rpc, chain_id, key


def main() -> None:
    rpc, chain_id, key = load_config()
    if chain_id != SEPOLIA_CHAIN_ID:
        fail(f"CHAIN_ID in .env is {chain_id}, expected {SEPOLIA_CHAIN_ID} (Sepolia).")

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
    if not w3.is_connected():
        fail(f"Cannot connect to RPC {rpc}")
    remote_id = w3.eth.chain_id
    if remote_id != SEPOLIA_CHAIN_ID:
        fail(f"RPC reports chain id {remote_id}, expected {SEPOLIA_CHAIN_ID} (Sepolia).")

    account = w3.eth.account.from_key(key)
    balance = w3.eth.get_balance(account.address)
    print(f"Network  : Sepolia (chain id {remote_id})")
    print(f"Deployer : {account.address}")
    print(f"Balance  : {Web3.from_wei(balance, 'ether')} ETH")
    if balance < Web3.to_wei(MIN_BALANCE_ETH, "ether"):
        fail(f"Balance too low (need at least {MIN_BALANCE_ETH} ETH). Get Sepolia ETH from a faucet.")

    artifact = load_artifact()
    Factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])

    # --- Build an EIP-1559 (type 2) transaction -----------------------------
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    base_fee = w3.eth.get_block("latest")["baseFeePerGas"]
    try:
        priority_fee = max(w3.eth.max_priority_fee, Web3.to_wei(1, "gwei"))
    except Exception:
        priority_fee = Web3.to_wei(1.5, "gwei")
    max_fee = base_fee * 2 + priority_fee

    tx = Factory.constructor().build_transaction({
        "from": account.address,
        "nonce": nonce,
        "chainId": SEPOLIA_CHAIN_ID,
        "maxPriorityFeePerGas": priority_fee,
        "maxFeePerGas": max_fee,
        "gas": 0,  # placeholder, replaced below
    })
    tx.pop("gas")
    gas_estimate = w3.eth.estimate_gas(tx)
    tx["gas"] = int(gas_estimate * 1.2)  # 20% safety buffer

    max_cost = tx["gas"] * max_fee
    print(f"Gas      : estimate {gas_estimate}, limit {tx['gas']}, "
          f"maxFee {Web3.from_wei(max_fee, 'gwei'):.3f} gwei (max cost {Web3.from_wei(max_cost, 'ether'):.6f} ETH)")
    if balance < max_cost:
        fail("Balance does not cover the worst-case gas cost. Top up from a faucet.")

    # --- Sign locally and broadcast ----------------------------------------
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    tx_hex = "0x" + tx_hash.hex().removeprefix("0x")
    print(f"Sent tx  : {tx_hex}\n           {EXPLORER}/tx/{tx_hex}\nWaiting for confirmation ...")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300, poll_latency=3)
    if receipt.status != 1:
        fail(f"Deployment transaction reverted: {EXPLORER}/tx/{tx_hex}")

    address = receipt.contractAddress
    deployment = {
        "network": "sepolia",
        "chainId": SEPOLIA_CHAIN_ID,
        "address": address,
        "deployBlock": receipt.blockNumber,
        "txHash": tx_hex,
        "deployer": account.address,
        "deployedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    DEPLOYMENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEPLOYMENT_FILE.write_text(json.dumps(deployment, indent=2), encoding="utf-8")

    contract = w3.eth.contract(address=address, abi=artifact["abi"])
    print("\nDeployed!")
    print(f"  Contract : {address}")
    print(f"  Block    : {receipt.blockNumber}   gas used {receipt.gasUsed}")
    print(f"  Owner    : {contract.functions.owner().call()}")
    print(f"  Etherscan: {EXPLORER}/address/{address}")
    print(f"  Saved    : {DEPLOYMENT_FILE.relative_to(HERE.parent)}")
    print("\nPaste into backend/.env:")
    print(f"  CONTRACT_ADDRESS={address}")
    print(f"  CONTRACT_DEPLOY_BLOCK={receipt.blockNumber}")
    print("Paste into frontend/.env.local:")
    print(f"  NEXT_PUBLIC_CONTRACT_ADDRESS={address}")


if __name__ == "__main__":
    main()
