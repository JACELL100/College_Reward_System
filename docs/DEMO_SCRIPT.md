# CampusCoin — Demo Script (5–7 minutes + Viva)

HBCC701 ISE-2 · College Reward Point System · `<Student Name>` · `<Roll No.>`

Target length: **6:30**. Each segment lists what to **say**, what to **show/do**, and which **rubric item** it earns.

| Rubric component | Marks | Covered in segment |
|---|---|---|
| Problem Understanding & Blockchain Design | 4 | 1, 2 |
| Prototype / Code Execution & Demonstration | 6 | 3, 4, 5, 6, 7 |
| Technology Integration & Self-Research | 4 | 8 |
| Security, Limitations & Research Challenge | 2 | 7, 9 |
| Presentation & Viva | 4 | whole demo + Q&A (see `REPORT.md` → Viva Preparation) |

---

## Pre-demo checklist (do 15 minutes before)

- [ ] Open `https://<service>.onrender.com/api/health` — wait until it returns `"status":"ok"` (Render free tier cold start ~50 s).
- [ ] Browser profile A: signed in as **Faculty/Admin** (Google), MetaMask account *Faculty* (owner/issuer) on **Sepolia**.
- [ ] Browser profile B (or incognito with MetaMask): signed in as **Student**, MetaMask account *Student A* on Sepolia, wallet linked.
- [ ] A second student wallet (*Student B*) linked, to receive a transfer.
- [ ] Each wallet has ≥ 0.01 Sepolia ETH (faucet or in-app gas drip).
- [ ] Tabs open: DApp, `https://sepolia.etherscan.io/address/<contract>`, VS Code on `contracts/CollegeRewardPoints.sol`,
      terminal in `blockchain/` with the venv active, `docs/REPORT.md` architecture diagram.
- [ ] Note Student A's starting balance (write it down) so you can state the expected new balance.
- [ ] Fallback: if Sepolia is congested or the internet fails, run `python test_contract.py` (in-memory EVM) and show the
      pre-recorded tx hashes in the report's transaction log.

---

## 1. Problem and why blockchain — 0:00 → 0:45  *(Rubric: Problem & Design)*

**Say:**
"Colleges reward students for hackathons, papers, volunteering and sports, but those points live in spreadsheets — they can be
edited silently, students can't verify them, and they can't be transferred or spent across departments. CampusCoin turns these
rewards into an ERC20 token, College Reward Points or CRP, on Ethereum. Blockchain gives a tamper-evident public record, rules
enforced by code — only authorised faculty can issue, max 1000 per transaction — and true student ownership. Private data like
names and emails stays off-chain."

**Show:** DApp landing page (live stats: total supply, holders, recent activity).

## 2. Architecture and Ethereum components — 0:45 → 1:45  *(Rubric: Problem & Design)*

**Show:** the architecture diagram in `REPORT.md` (Part A.4).

**Say (point at each box):**
- "**Accounts:** every student and faculty member has an externally owned account in MetaMask; the CRP contract is a contract account."
- "**Transactions:** issue, transfer and redeem are signed transactions; reading a balance is a free call."
- "**Ether and gas:** CRP is not ETH — you pay gas in Sepolia ETH to change state."
- "**EVM:** every node runs our contract bytecode and checks the rules identically."
- "**Node:** the DApp and backend talk to a public Sepolia RPC node."
- "**Blockchain:** blocks give every reward a permanent, timestamped record."
- "The backend on Render only indexes events and runs the AI — it **cannot mint**. Balances in the UI come straight from the chain."

## 3. Issue reward points — 1:45 → 2:50  *(Rubric: Execution)*

**Do (Faculty profile):**
1. Issuer console → type: "Student A won first place at the college hackathon".
2. Click **AI suggest** → shows *Hackathon Win · 200 CRP* + reason. "The AI only suggests — I still sign."
3. Pick Student A from the directory → **Issue** → MetaMask popup.

**Say while MetaMask is open:** "MetaMask shows the contract call and the gas estimate. When I confirm, it signs with my private
key locally and broadcasts the raw transaction to the node."

4. Confirm → tx hash appears → wait for confirmation (~12 s).

## 4. Show the transaction — 2:50 → 3:40  *(Rubric: Execution — "how the transaction was processed")*

**Do:** click the tx hash → Etherscan.

**Point out:** Status *Success* · Block number · From = faculty · To = CRP contract · Gas used and fee in ETH · Input data
decoded as `issueReward(...)` · **Logs** tab: `Transfer(0x000…0 → Student A, 200)` (a mint) and `RewardIssued(issuer, to, 200, reason)`.

**Say:** "A validator included this in a block; every node's EVM ran `onlyIssuer`, checked the 1000 cap, increased the balance
and total supply, and emitted these events. Mint is a Transfer *from the zero address*."

## 5. Check balance and transfer — 3:40 → 4:40  *(Rubric: Execution — "resulting state")*

**Do (Student A profile):**
1. Dashboard → balance increased by 200 (state the before/after numbers). "This is read directly from the chain with `balanceOf`, not from our database."
2. Optional terminal proof: `python interact.py balance <StudentA>` → same number.
3. **Send** → search Student B → 30 CRP → MetaMask confirm.
4. After confirmation: A's balance −30, B's balance +30; Etherscan shows `Transfer(A → B, 30)`. "Total supply did not change — transfer just moves points."

## 6. Redeem — 4:40 → 5:15  *(Rubric: Execution)*

**Do:** Store → *Canteen Meal Voucher (50 CRP)* → **Redeem** → confirm.

**Show:** voucher code in the DApp; balance −50; Etherscan logs `Transfer(A → 0x0, 50)` + `Redeemed(A, 50, itemId)`.

**Say:** "Redeem burns the tokens, so total supply drops by 50. The backend sees the `Redeemed` event and creates the voucher
that the canteen admin marks fulfilled."

## 7. Code walkthrough + security in action — 5:15 → 6:00  *(Rubric: Execution "explain source code", Security)*

**Show in VS Code (`contracts/CollegeRewardPoints.sol`):**
- `onlyIssuer` / `whenNotPaused` modifiers.
- `issueReward`: zero-address, zero-amount, `maxIssuePerTx`, reason-length checks → mint → two events.
- `_transfer`: `InsufficientBalance` check; Solidity 0.8 checked math.
- `redeem`: burn + `Redeemed`.

**Do (negative test, Student profile or `interact.py` with the student key):** try to issue → reverts with `NotIssuer()`.

**Say:** "Two security points: unauthorised minting is blocked on-chain by roles, a per-transaction cap and a pause circuit
breaker — even if our backend were hacked it couldn't mint. And private keys never leave MetaMask; wallet linking uses a signed,
time-limited message. No external calls means no reentrancy."

## 8. Technology choices, DApp connection, Fabric — 6:00 → 6:40  *(Rubric: Technology & Self-Research)*

**Say:**
- "Toolchain: Solidity, compiled and deployed with **web3.py + py-solc-x**; tests run on **EthereumTester**, an in-memory EVM that plays Ganache's role. Truffle and Ganache were sunset in 2023."
- "DApp connection: **ethers v6** — a JSON-RPC provider for reads and MetaMask as the signer, discovered via EIP-6963, switched to Sepolia. Web3.js would be `contract.methods.transfer().send()` — same idea."
- "Cloud: Supabase, Render, Vercel. AI: Groq LLM for reward suggestions and a grounded assistant. Proposed: ERP attendance and RFID check-ins feeding batched issuance."
- "**Hyperledger Fabric** is the private alternative — MSP identities, channels, chaincode, endorsement policies, no gas — better for private inter-college records, but our points must be student-owned and publicly verifiable, so public Ethereum fits."

## 9. Limitations and research challenge — 6:40 → 7:00  *(Rubric: Limitations & Research)*

**Say:** "Limitations: students need ETH for gas and L1 throughput is low — answers are batching, an L2, and the gas drip. My research
question: can we make rewards **gasless and private** — ERC-4337 paymasters or ERC-2771 relayers so the college pays gas, and
zero-knowledge proofs so a student proves 'I have at least 400 points' without revealing their history? Thank you."

---

## If something goes wrong

| Problem | Recovery line + action |
|---|---|
| MetaMask on wrong network | "The DApp detects the chain ID" → click **Switch network** (adds Sepolia `0xaa36a7`). |
| Tx pending for long | "Sepolia is a real network, so inclusion depends on validators" → show a previous tx hash from the report meanwhile. |
| API slow / 502 | "Free-tier backend cold start — but balances come from the chain" → show balance still loads; proceed with Etherscan. |
| Out of Sepolia ETH | Use the in-app gas drip or switch to the Faculty wallet for the transfer demo. |
| Internet down | Run `python test_contract.py` live and walk through the test output and code. |

## Viva quick-reference

See `REPORT.md` → **Viva Preparation — 15 Likely Questions**. Key numbers to remember: chainId **11155111**, decimals **0**,
max issue **1000** per recipient per tx, batch ≤ **50**, reason ≤ **96 bytes**, base tx cost **21,000 gas**, block time **~12 s**.
