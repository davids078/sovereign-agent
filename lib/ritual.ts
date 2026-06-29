import { defineChain } from "viem";

// ─── Ritual Chain Definition ────────────────────────────────────────────────
export const ritualChain = defineChain({
  id: 1979,
  name: "Ritual Chain",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.ritualfoundation.org"],
      webSocket: ["wss://rpc.ritualfoundation.org/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Ritual Explorer",
      url: "https://explorer.ritualfoundation.org",
    },
  },
  testnet: true,
});

// ─── System Contract Addresses ──────────────────────────────────────────────
export const ADDRESSES = {
  RITUAL_WALLET:   "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948",
  ASYNC_JOB_TRACKER: "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5",
  TEE_REGISTRY:    "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F",
  SCHEDULER:       "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B",
  SECRETS_ACL:     "0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD",
  ASYNC_DELIVERY:  "0x5A16214fF555848411544b005f7Ac063742f39F6",
  SOV_PRECOMPILE:  "0x000000000000000000000000000000000000080C",
} as const;

// ─── SovereignAgent ABI ─────────────────────────────────────────────────────
export const SOVEREIGN_AGENT_ABI = [
  // Read
  { name: "owner",        type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "address" }] },
  { name: "agentPrompt",  type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
  { name: "agentHarness", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
  { name: "wakeCount",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "wakeDelay",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint32" }] },
  { name: "isRunning",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "bool" }] },
  { name: "lastJobId",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "lastResult",   type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "bytes" }] },
  { name: "results",      type: "function", stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [{ type: "bytes" }] },

  // Write
  { name: "start",        type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "prompt", type: "string" }, { name: "delay", type: "uint32" }],
    outputs: [] },
  { name: "stop",         type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "setPrompt",    type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "prompt", type: "string" }], outputs: [] },
  { name: "setWakeDelay", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "delay", type: "uint32" }], outputs: [] },
  { name: "fundWallet",   type: "function", stateMutability: "payable",
    inputs: [], outputs: [] },
  { name: "withdrawWallet", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "transferOwnership", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }], outputs: [] },

  // Events
  { name: "AgentStarted",    type: "event",
    inputs: [{ name: "prompt", type: "string", indexed: false },
             { name: "delay",  type: "uint32", indexed: false }] },
  { name: "AgentWoke",       type: "event",
    inputs: [{ name: "wakeCount", type: "uint256", indexed: true },
             { name: "jobId",     type: "bytes32",  indexed: true },
             { name: "block",     type: "uint256",  indexed: false }] },
  { name: "ResultReceived",  type: "event",
    inputs: [{ name: "jobId",  type: "bytes32", indexed: true },
             { name: "result", type: "bytes",   indexed: false }] },
  { name: "AgentStopped",    type: "event", inputs: [] },
] as const;

// ─── RitualWallet ABI (subset) ──────────────────────────────────────────────
export const RITUAL_WALLET_ABI = [
  { name: "deposit",  type: "function", stateMutability: "payable",
    inputs: [], outputs: [] },
  { name: "lock",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "lockedBalanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;
