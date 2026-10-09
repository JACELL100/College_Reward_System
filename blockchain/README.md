# blockchain/ - CollegeRewardPoints (CRP) tooling

Solidity source: `../contracts/CollegeRewardPoints.sol` (ERC20, decimals 0, owner + issuers, pause).
All scripts use web3.py v7 and their own virtualenv in `blockchain/.venv`.

## Setup (Windows, Python 3.11)

```bash
cd blockchain
python -m venv .venv
.venv/Scripts/python -m pip install --no-deps eth-tester==0.13.0b1 py-evm==0.12.1b1
.venv/Scripts/python -m pip install -r requirements.txt
```
(`--no-deps` for eth-tester/py-evm avoids `safe-pysha3`, which needs a C compiler on Windows.)

## Commands

| Step | Command | What it does |
|---|---|---|
| Compile | `.venv/Scripts/python compile.py` | Installs solc 0.8.24, compiles (optimizer 200, evm `paris`), writes `build/CollegeRewardPoints.json` and `../backend/app/abi/CollegeRewardPoints.json` |
| Test | `.venv/Scripts/python test_contract.py` | 13 checks on an in-memory EVM (no ETH needed) |
| Deploy | `.venv/Scripts/python deploy.py` | Deploys to Sepolia, writes `deployments/sepolia.json`, prints the env lines to paste |
| Demo | `.venv/Scripts/python interact.py info` | Reads the deployed contract |

Viva demo (create -> transfer -> show tx -> check balance):
```bash
.venv/Scripts/python interact.py issue 0xStudent 100 "Hackathon Win"
.venv/Scripts/python interact.py transfer 0xFriend 25
.venv/Scripts/python interact.py balance 0xFriend
.venv/Scripts/python interact.py add-issuer 0xFaculty
```
Every write prints the tx hash and its Sepolia Etherscan link.

## `.env` (never commit)

```
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CHAIN_ID=11155111
DEPLOYER_PRIVATE_KEY=0x...
```
- **Private key:** MetaMask -> account menu (three dots) -> Account details -> Show private key. Use a test-only account.
- **Sepolia ETH:** free faucets such as Google Cloud Web3 faucet (cloud.google.com/application/web3/faucet/ethereum/sepolia),
  Alchemy (sepoliafaucet.com) or the PoW faucet (sepolia-faucet.pk910.de). About 0.01 ETH covers deployment (~1.07M gas).
  The deployer becomes the contract **owner** (admin + issuer).

## Remix alternative

1. Open remix.ethereum.org and paste `contracts/CollegeRewardPoints.sol`.
2. Compiler tab: version 0.8.24, enable optimization (200), EVM version `paris`. Compile.
3. Deploy tab: environment "Injected Provider - MetaMask" (Sepolia selected in MetaMask), Deploy, confirm.
4. Copy the deployed address into `CONTRACT_ADDRESS` (backend) and `NEXT_PUBLIC_CONTRACT_ADDRESS` (frontend), and
   the deploy block number (from Etherscan) into `CONTRACT_DEPLOY_BLOCK`.
