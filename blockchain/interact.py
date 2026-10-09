"""Tiny CLI to demo the deployed CRP contract on Sepolia (for the viva).

Demo sequence:  create (issue) -> transfer -> show tx -> check balance

  python interact.py info
  python interact.py balance <address>
  python interact.py issue <to> <amount> "<reason>"
  python interact.py transfer <to> <amount>
  python interact.py add-issuer <address>

Write commands are signed locally with DEPLOYER_PRIVATE_KEY from blockchain/.env.
The contract address is read from blockchain/deployments/sepolia.json
(or CONTRACT_ADDRESS in blockchain/.env).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

from compile import load_artifact

HERE = Path(__file__).resolve().parent
EXPLORER = "https://sepolia.etherscan.io"
DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com"

load_dotenv(HERE / ".env")
w3 = Web3(Web3.HTTPProvider(os.getenv("SEPOLIA_RPC_URL") or DEFAULT_RPC, request_kwargs={"timeout": 60}))


def contract_address() -> str:
    addr = os.getenv("CONTRACT_ADDRESS")
    dep = HERE / "deployments" / "sepolia.json"
    if not addr and dep.exists():
        addr = json.loads(dep.read_text(encoding="utf-8"))["address"]
    if not addr:
        sys.exit("No contract address: run deploy.py first (or set CONTRACT_ADDRESS in blockchain/.env).")
    return Web3.to_checksum_address(addr)


crp = w3.eth.contract(address=contract_address(), abi=load_artifact()["abi"])
f = crp.functions


def signer():
    key = (os.getenv("DEPLOYER_PRIVATE_KEY") or "").strip()
    if not key:
        sys.exit("DEPLOYER_PRIVATE_KEY is empty in blockchain/.env - needed for write commands.")
    return w3.eth.account.from_key(key if key.startswith("0x") else "0x" + key)


def send(fn) -> dict:
    """Simulate, then sign & send an EIP-1559 tx calling `fn`; wait for the receipt."""
    acct = signer()
    fn.call({"from": acct.address})  # dry-run: surfaces custom-error reverts before paying gas
    base_fee = w3.eth.get_block("latest")["baseFeePerGas"]
    tip = Web3.to_wei(1.5, "gwei")
    tx = fn.build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address, "pending"),
        "chainId": w3.eth.chain_id,
        "maxPriorityFeePerGas": tip,
        "maxFeePerGas": base_fee * 2 + tip,
    })
    tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
    tx_hash = w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction)
    h = "0x" + tx_hash.hex().removeprefix("0x")
    print(f"tx hash  : {h}\nexplorer : {EXPLORER}/tx/{h}\nwaiting for confirmation ...")
    r = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300, poll_latency=3)
    print(f"status   : {'SUCCESS' if r.status == 1 else 'FAILED'} (block {r.blockNumber}, gas used {r.gasUsed})")
    return r


def show_balance(addr: str) -> None:
    print(f"balance  : {Web3.to_checksum_address(addr)} = {f.balanceOf(Web3.to_checksum_address(addr)).call()} CRP")


def cmd_info() -> None:
    print(f"contract : {crp.address}\nexplorer : {EXPLORER}/address/{crp.address}")
    print(f"token    : {f.name().call()} ({f.symbol().call()}), decimals {f.decimals().call()}")
    print(f"supply   : {f.totalSupply().call()} CRP  (issued {f.totalIssued().call()}, "
          f"redeemed {f.totalRedeemed().call()})")
    print(f"owner    : {f.owner().call()}")
    print(f"paused   : {f.paused().call()}   maxIssuePerTx: {f.maxIssuePerTx().call()}")


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    cmd, args = argv[0], argv[1:]
    cs = Web3.to_checksum_address
    if cmd == "info":
        cmd_info()
    elif cmd == "balance" and len(args) == 1:
        show_balance(args[0])
    elif cmd == "issue" and len(args) >= 3:
        to, amount, reason = cs(args[0]), int(args[1]), " ".join(args[2:])
        send(f.issueReward(to, amount, reason))
        show_balance(to)
    elif cmd == "transfer" and len(args) == 2:
        to, amount = cs(args[0]), int(args[1])
        me = signer().address
        send(f.transfer(to, amount))
        show_balance(me)
        show_balance(to)
    elif cmd == "add-issuer" and len(args) == 1:
        acct = cs(args[0])
        send(f.addIssuer(acct))
        print(f"isIssuer : {acct} = {f.isIssuer(acct).call()}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
