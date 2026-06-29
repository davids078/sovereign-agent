# ⬡ Sovereign Agent — Ritual Chain dApp

> Autonomous AI agent that runs entirely on-chain. No keeper. No cron. No server.
> Powered by Ritual Chain precompiles: Sovereign Agent (0x080C) + Scheduler.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_ORG/sovereign-agent&env=NEXT_PUBLIC_CONTRACT_ADDRESS,NEXT_PUBLIC_RPC_URL&envDescription=Ritual+Chain+contract+address+and+RPC&project-name=sovereign-agent)

---

## Architecture

```
Owner calls start()
       │
       ▼
Scheduler (0x56e7…8B)
  fires wakeUp() every N blocks
       │
       ▼
SovereignAgent.wakeUp()
  calls sov.runAgent() → precompile 0x080C
       │
       ▼
TEE Executor (claude-code harness)
  runs agent prompt autonomously
       │
       ▼
AsyncDelivery (0x5A16…6)
  calls onSovereignAgentResult()
  on-chain result stored + event emitted
       │
       ▼
Loop repeats ──────────────────────────┘
```

---

## Repo structure

```
sovereign-agent/
├── src/
│   └── SovereignAgent.sol      # Core contract
├── script/
│   └── Deploy.s.sol            # Foundry deploy script
├── test/
│   └── SovereignAgent.t.sol    # Forge tests
├── pages/
│   ├── _app.tsx                # wagmi + react-query providers
│   └── index.tsx               # Full MetaMask dApp UI
├── components/                 # (extend here)
├── lib/
│   ├── ritual.ts               # Chain config + ABI
│   └── wagmi.ts                # wagmi config
├── styles/
│   ├── globals.css
│   └── App.module.css
├── public/
│   └── favicon.svg
├── foundry.toml
├── vercel.json
└── package.json
```

---

## Quick start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Foundry | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Node.js | ≥18 | `https://nodejs.org` |
| MetaMask | latest | Chrome extension |

---

## Step 1 — Clone and install

```bash
git clone https://github.com/YOUR_ORG/sovereign-agent
cd sovereign-agent

# Solidity deps
forge install foundry-rs/forge-std

# Frontend deps
npm install
```

---

## Step 2 — Get testnet RITUAL

1. Go to **https://faucet.ritualfoundation.org**
2. Paste your wallet address → claim testnet RITUAL
3. You need ≥ 0.3 RITUAL: ~0.1 for deploy gas, ~0.2 locked in RitualWallet for precompile fees

---

## Step 3 — Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
AGENT_PROMPT=Monitor Ritual Chain. Every wakeup: summarize recent blocks, flag anomalies.
WAKE_DELAY=50
```

> ⚠️ **Never commit `.env.local`** — it's in `.gitignore`

---

## Step 4 — Run tests

```bash
forge test -vvv
```

All 14 tests should pass. The test suite covers:
- Ownership controls
- `start()` / `stop()` state transitions
- `wakeUp()` from scheduler only
- TEE callback delivery
- Event emissions

---

## Step 5 — Deploy to Ritual Chain

```bash
source .env.local

forge script script/Deploy.s.sol \
  --rpc-url https://rpc.ritualfoundation.org \
  --broadcast \
  --chain-id 1979 \
  -vvvv
```

Note your deployed contract address from the output, e.g.:
```
Contract  : 0x4a7f...c9e2
Started   : wakeDelay = 50 blocks (~17 seconds)
```

---

## Step 6 — Add Ritual Chain to MetaMask

**Automatically:** Click "Switch to Ritual Chain" in the dApp UI — MetaMask will prompt to add it.

**Manually:**
| Field | Value |
|-------|-------|
| Network name | Ritual Chain |
| RPC URL | `https://rpc.ritualfoundation.org` |
| Chain ID | `1979` |
| Symbol | `RITUAL` |
| Explorer | `https://explorer.ritualfoundation.org` |

---

## Step 7 — Run the UI locally

```bash
npm run dev
# → http://localhost:3000
```

1. Open http://localhost:3000
2. Click **Connect MetaMask**
3. Switch to Ritual Chain when prompted
4. Paste your contract address and click **Load →**
5. Click **start()** to begin the autonomous loop

---

## Step 8 — Deploy to Vercel

### Option A: One-click (recommended)

Click the **Deploy with Vercel** button at the top of this README.

Set these environment variables in the Vercel wizard:
| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Your deployed contract address |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.ritualfoundation.org` |

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login

# First deploy (sets up project)
vercel

# Subsequent deploys
vercel --prod
```

Add env vars via Vercel dashboard:
**Project → Settings → Environment Variables**

Or via CLI:
```bash
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS
vercel env add NEXT_PUBLIC_RPC_URL
```

Then redeploy:
```bash
vercel --prod
```

---

## Verify contract on explorer

```bash
forge verify-contract \
  <YOUR_CONTRACT_ADDRESS> \
  src/SovereignAgent.sol:SovereignAgent \
  --rpc-url https://rpc.ritualfoundation.org \
  --etherscan-api-key verifykey \
  --verifier-url https://explorer.ritualfoundation.org/api
```

---

## Monitor your agent

```bash
# Is it running?
cast call <CONTRACT> "isRunning()" --rpc-url https://rpc.ritualfoundation.org

# Wakeup count
cast call <CONTRACT> "wakeCount()" --rpc-url https://rpc.ritualfoundation.org

# Watch live events
cast logs \
  --rpc-url https://rpc.ritualfoundation.org \
  --address <CONTRACT> \
  "AgentWoke(uint256,bytes32,uint256)"
```

---

## Keep it running — fund the RitualWallet

The agent draws from RitualWallet for each precompile call. Top it up anytime:

```bash
# Via cast
cast send <CONTRACT> "fundWallet()" \
  --value 0.1ether \
  --rpc-url https://rpc.ritualfoundation.org \
  --private-key $PRIVATE_KEY

# Or via the UI: Control tab → Fund RitualWallet
```

---

## System contract addresses (Ritual Chain 1979)

| Contract | Address |
|----------|---------|
| Sovereign Agent precompile | `0x000000000000000000000000000000000000080C` |
| Scheduler | `0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B` |
| AsyncDelivery | `0x5A16214fF555848411544b005f7Ac063742f39F6` |
| RitualWallet | `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948` |
| AsyncJobTracker | `0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5` |

---

## Troubleshooting

**`start()` reverts**
→ RitualWallet locked balance too low. Call `fundWallet()` with ≥ 0.1 RITUAL first.

**MetaMask shows wrong network**
→ Click "Switch to Ritual Chain" in the banner — the dApp will add the network automatically.

**`evm_version` error**
→ Make sure `foundry.toml` has `evm_version = "shanghai"`. Ritual does not support Cancun opcodes.

**Agent stops after a few cycles**
→ RitualWallet balance drained. Top up via the UI or `cast send`.

**`OnlyScheduler` revert on `wakeUp()`**
→ Don't call `wakeUp()` directly — only the Scheduler contract (0x56e7…) can.

---

## License

MIT
