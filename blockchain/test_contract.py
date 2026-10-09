"""Local test-suite for CollegeRewardPoints.

Runs against web3.py's EthereumTesterProvider (an in-memory py-evm chain), so it
needs no network, no ETH and no private keys.

Usage:  python test_contract.py      (exit code 0 = all passed)
"""
from __future__ import annotations

import sys
import traceback

from web3 import Web3, EthereumTesterProvider
from web3.logs import DISCARD

from compile import load_artifact

w3 = Web3(EthereumTesterProvider())
OWNER, ISSUER, ALICE, BOB, CAROL, MALLORY = w3.eth.accounts[:6]
ZERO = "0x" + "00" * 20

PASSED: list[str] = []


# ---------------------------------------------------------------- helpers
def selector(signature: str) -> str:
    """4-byte selector of a custom error, e.g. 'NotIssuer()' -> '0x...'."""
    return "0x" + Web3.keccak(text=signature)[:4].hex().removeprefix("0x")


def expect_revert(fn, error_sig: str, sender) -> None:
    """Assert that sending `fn` from `sender` reverts with custom error `error_sig`."""
    want = selector(error_sig)
    try:
        fn.transact({"from": sender})
    except Exception as exc:  # web3 raises ContractCustomError / ContractLogicError
        # Collect revert data from the exception (and its cause chain) as text + hex.
        parts, e = [], exc
        while e is not None:
            for x in (getattr(e, "data", None), *e.args):
                parts.append(x.hex() if isinstance(x, (bytes, bytearray)) else str(x))
            e = e.__cause__ or e.__context__
        blob = " ".join(parts).lower()
        raw = repr(bytes.fromhex(want[2:]))[2:-1].lower()  # e.g. "\xffc:8"
        assert want[2:] in blob or raw in blob, f"expected {error_sig} ({want}), got: {blob[:300]}"
        return
    raise AssertionError(f"expected revert {error_sig}, but tx succeeded")


def send(fn, sender):
    tx = fn.transact({"from": sender})
    receipt = w3.eth.wait_for_transaction_receipt(tx)
    assert receipt.status == 1, "transaction failed"
    return receipt


def check(name: str):
    def deco(func):
        func._check_name = name
        return func
    return deco


# ---------------------------------------------------------------- deploy
artifact = load_artifact(force=True)
Factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
deploy_receipt = w3.eth.wait_for_transaction_receipt(Factory.constructor().transact({"from": OWNER}))
crp = w3.eth.contract(address=deploy_receipt.contractAddress, abi=artifact["abi"])
f = crp.functions
bal = lambda a: f.balanceOf(a).call()


# ---------------------------------------------------------------- tests
@check("deploy + metadata (name, symbol, decimals=0, supply 0, owner, defaults)")
def t_metadata():
    assert f.name().call() == "College Reward Points"
    assert f.symbol().call() == "CRP"
    assert f.decimals().call() == 0
    assert f.totalSupply().call() == 0
    assert f.owner().call() == OWNER
    assert f.isIssuer(OWNER).call() is True
    assert f.isIssuer(ALICE).call() is False
    assert f.paused().call() is False
    assert f.maxIssuePerTx().call() == 1000
    ev = crp.events.IssuerAdded().process_receipt(deploy_receipt, errors=DISCARD)
    assert ev and ev[0].args.account == OWNER


@check("issueReward mints, emits Transfer(0x0) then RewardIssued")
def t_issue():
    r = send(f.issueReward(ALICE, 200, "Hackathon Win"), OWNER)
    assert bal(ALICE) == 200 and f.totalSupply().call() == 200
    t = crp.events.Transfer().process_receipt(r, errors=DISCARD)[0]
    ri = crp.events.RewardIssued().process_receipt(r, errors=DISCARD)[0]
    assert t.args["from"] == ZERO and t.args.to == ALICE and t.args.value == 200
    assert ri.args.issuer == OWNER and ri.args.reason == "Hackathon Win"
    assert t.logIndex < ri.logIndex


@check("batchIssueReward mints to several recipients")
def t_batch():
    r = send(f.batchIssueReward([BOB, CAROL], [50, 70], "Event Volunteering"), OWNER)
    assert bal(BOB) == 50 and bal(CAROL) == 70
    assert len(crp.events.RewardIssued().process_receipt(r, errors=DISCARD)) == 2
    expect_revert(f.batchIssueReward([BOB], [1, 2], "x"), "LengthMismatch()", OWNER)
    expect_revert(f.batchIssueReward([], [], "x"), "LengthMismatch()", OWNER)
    expect_revert(f.batchIssueReward([BOB] * 51, [1] * 51, "x"), "BatchTooLarge(uint256,uint256)", OWNER)


@check("transfer moves points; insufficient balance / zero address revert")
def t_transfer():
    send(f.transfer(BOB, 30), ALICE)
    assert bal(ALICE) == 170 and bal(BOB) == 80
    expect_revert(f.transfer(BOB, 10_000), "InsufficientBalance(uint256,uint256)", ALICE)
    expect_revert(f.transfer(ZERO, 1), "ZeroAddress()", ALICE)


@check("approve + transferFrom spends allowance")
def t_allowance():
    send(f.approve(CAROL, 40), ALICE)
    assert f.allowance(ALICE, CAROL).call() == 40
    send(f.transferFrom(ALICE, BOB, 25), CAROL)
    assert f.allowance(ALICE, CAROL).call() == 15
    assert bal(ALICE) == 145 and bal(BOB) == 105
    expect_revert(f.transferFrom(ALICE, BOB, 16), "InsufficientAllowance(uint256,uint256)", CAROL)


@check("redeem burns points, emits Transfer(to 0x0) + Redeemed")
def t_redeem():
    supply_before = f.totalSupply().call()
    r = send(f.redeem(50, 1), ALICE)
    assert bal(ALICE) == 95 and f.totalSupply().call() == supply_before - 50
    t = crp.events.Transfer().process_receipt(r, errors=DISCARD)[0]
    rd = crp.events.Redeemed().process_receipt(r, errors=DISCARD)[0]
    assert t.args.to == ZERO and rd.args.student == ALICE and rd.args.amount == 50 and rd.args.itemId == 1
    expect_revert(f.redeem(10_000, 1), "InsufficientBalance(uint256,uint256)", ALICE)
    expect_revert(f.redeem(0, 1), "ZeroAmount()", ALICE)


@check("totalIssued / totalRedeemed counters")
def t_totals():
    assert f.totalIssued().call() == 320
    assert f.totalRedeemed().call() == 50
    assert f.totalSupply().call() == 270


@check("addIssuer / removeIssuer; issuer can mint, non-issuer reverts NotIssuer")
def t_issuers():
    expect_revert(f.issueReward(ALICE, 10, "x"), "NotIssuer()", ISSUER)
    r = send(f.addIssuer(ISSUER), OWNER)
    assert crp.events.IssuerAdded().process_receipt(r, errors=DISCARD)[0].args.account == ISSUER
    assert f.isIssuer(ISSUER).call()
    send(f.issueReward(CAROL, 10, "Paper Publication"), ISSUER)
    assert bal(CAROL) == 80
    expect_revert(f.addIssuer(MALLORY), "NotOwner()", ISSUER)
    r = send(f.removeIssuer(ISSUER), OWNER)
    assert crp.events.IssuerRemoved().process_receipt(r, errors=DISCARD)[0].args.account == ISSUER
    assert not f.isIssuer(ISSUER).call()
    expect_revert(f.issueReward(ALICE, 10, "x"), "NotIssuer()", ISSUER)
    expect_revert(f.issueReward(ALICE, 10, "x"), "NotIssuer()", MALLORY)
    expect_revert(f.addIssuer(ZERO), "ZeroAddress()", OWNER)


@check("maxIssuePerTx cap enforced and adjustable by owner")
def t_max_issue():
    expect_revert(f.issueReward(ALICE, 1001, "x"), "ExceedsMaxIssue(uint256,uint256)", OWNER)
    expect_revert(f.batchIssueReward([ALICE, BOB], [5, 1001], "x"), "ExceedsMaxIssue(uint256,uint256)", OWNER)
    expect_revert(f.issueReward(ALICE, 0, "x"), "ZeroAmount()", OWNER)
    expect_revert(f.issueReward(ZERO, 5, "x"), "ZeroAddress()", OWNER)
    send(f.setMaxIssuePerTx(2000), OWNER)
    assert f.maxIssuePerTx().call() == 2000
    send(f.issueReward(ALICE, 1500, "Big award"), OWNER)
    send(f.setMaxIssuePerTx(1000), OWNER)
    expect_revert(f.setMaxIssuePerTx(5), "NotOwner()", ALICE)


@check("reason longer than 96 bytes reverts ReasonTooLong (96 ok)")
def t_reason():
    send(f.issueReward(BOB, 1, "a" * 96), OWNER)
    expect_revert(f.issueReward(BOB, 1, "a" * 97), "ReasonTooLong()", OWNER)
    expect_revert(f.batchIssueReward([BOB], [1], "a" * 97), "ReasonTooLong()", OWNER)


@check("pause blocks transfer / transferFrom / issue / redeem; unpause restores")
def t_pause():
    expect_revert(f.pause(), "NotOwner()", ALICE)
    send(f.pause(), OWNER)
    assert f.paused().call()
    expect_revert(f.transfer(BOB, 1), "ContractPaused()", ALICE)
    expect_revert(f.transferFrom(ALICE, BOB, 1), "ContractPaused()", CAROL)
    expect_revert(f.issueReward(BOB, 1, "x"), "ContractPaused()", OWNER)
    expect_revert(f.redeem(1, 1), "ContractPaused()", ALICE)
    send(f.unpause(), OWNER)
    assert not f.paused().call()
    send(f.transfer(BOB, 1), ALICE)


@check("transferOwnership: new owner is admin + issuer, old owner loses rights")
def t_ownership():
    expect_revert(f.transferOwnership(ALICE), "NotOwner()", ALICE)
    expect_revert(f.transferOwnership(ZERO), "ZeroAddress()", OWNER)
    r = send(f.transferOwnership(CAROL), OWNER)
    ev = crp.events.OwnershipTransferred().process_receipt(r, errors=DISCARD)[0]
    assert ev.args.previousOwner == OWNER and ev.args.newOwner == CAROL
    assert f.owner().call() == CAROL
    assert f.isIssuer(CAROL).call() and not f.isIssuer(OWNER).call()
    send(f.issueReward(ALICE, 5, "From new owner"), CAROL)
    expect_revert(f.pause(), "NotOwner()", OWNER)
    expect_revert(f.issueReward(ALICE, 5, "x"), "NotIssuer()", OWNER)


@check("invariant: sum of balances == totalSupply == totalIssued - totalRedeemed")
def t_invariant():
    total = sum(bal(a) for a in (OWNER, ISSUER, ALICE, BOB, CAROL, MALLORY))
    supply = f.totalSupply().call()
    assert total == supply == f.totalIssued().call() - f.totalRedeemed().call()


TESTS = [t_metadata, t_issue, t_batch, t_transfer, t_allowance, t_redeem, t_totals,
         t_issuers, t_max_issue, t_reason, t_pause, t_ownership, t_invariant]


def main() -> int:
    print(f"Deployed CollegeRewardPoints at {crp.address} "
          f"(gas used {deploy_receipt.gasUsed}, solc {artifact['compiler']['solc']})\n")
    failed = 0
    for test in TESTS:
        try:
            test()
            print(f"PASS  {test._check_name}")
        except Exception:
            failed += 1
            print(f"FAIL  {test._check_name}")
            traceback.print_exc()
            break  # later tests depend on earlier state
    print(f"\n{len(TESTS) - failed if not failed else TESTS.index(test)}/{len(TESTS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
