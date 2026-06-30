import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import {
  useAccount, useConnect, useDisconnect, useChainId,
  useSwitchChain, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useWatchContractEvent,
  useBalance,
} from "wagmi";
import { parseEther, formatEther, isAddress } from "viem";
import { metaMask } from "wagmi/connectors";
import {
  ritualChain, SOVEREIGN_AGENT_ABI, ADDRESSES,
} from "../lib/ritual";
import styles from "../styles/App.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────
interface LogEntry {
  ts: string;
  type: "info" | "ok" | "warn" | "tee" | "sched" | "err";
  msg: string;
}

interface WakeEvent {
  wakeCount: bigint;
  jobId: string;
  block: bigint;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function fmtEth(v: bigint)  { return parseFloat(formatEther(v)).toFixed(4); }
function nowTs() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((x) => String(x).padStart(2, "0")).join(":") +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ─── Component ───────────────────────────────────────────────────────────────
export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect }              = useConnect();
  const { disconnect }           = useDisconnect();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();

  const [contractAddr, setContractAddr]   = useState("");
  const [savedAddr, setSavedAddr]         = useState<`0x${string}` | "">("");
  const [tab, setTab]                     = useState<"control"|"contract"|"events"|"log">("control");
  const [logs, setLogs]                   = useState<LogEntry[]>([
    { ts: nowTs(), type: "info", msg: "Ritual Chain Sovereign Agent UI ready." },
  ]);
  const [wakeEvents, setWakeEvents]       = useState<WakeEvent[]>([]);
  const [prompt, setPrompt]               = useState(
    "Monitor on-chain events. Every wakeup: summarize recent blocks, flag anomalies, post digest."
  );
  const [wakeDelay, setWakeDelay]         = useState("5000");
  const [fundAmount, setFundAmount]       = useState("0.1");
  const [pendingTx, setPendingTx]         = useState<`0x${string}` | undefined>();
  const [txLabel, setTxLabel]             = useState("");

  const isRitual = chainId === ritualChain.id;
  const contract = (savedAddr && isAddress(savedAddr) ? savedAddr : undefined) as `0x${string}` | undefined;

  // ─── Reads ────────────────────────────────────────────────────────────────
  const { data: isRunning, refetch: refetchRunning } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "isRunning", query: { enabled: !!contract } });
  const { data: wakeCount, refetch: refetchWake } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "wakeCount", query: { enabled: !!contract } });
  const { data: agentPrompt } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "agentPrompt", query: { enabled: !!contract } });
  const { data: delay } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "wakeDelay", query: { enabled: !!contract } });
  const { data: owner } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "owner", query: { enabled: !!contract } });
  const { data: lastJobId } =
    useReadContract({ address: contract, abi: SOVEREIGN_AGENT_ABI, functionName: "lastJobId", query: { enabled: !!contract } });
  const { data: contractBalance } =
    useBalance({ address: contract, chainId: ritualChain.id, query: { enabled: !!contract } });
  const { data: userBalance } =
    useBalance({ address, chainId: ritualChain.id, query: { enabled: !!address } });

  // ─── Writes ───────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();

  const { isLoading: txPending, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({ hash: pendingTx });

  useEffect(() => {
    if (txSuccess && txLabel) {
      addLog("ok", `${txLabel} confirmed ✓`);
      refetchRunning();
      refetchWake();
      setPendingTx(undefined);
      setTxLabel("");
    }
  }, [txSuccess, txLabel]);

  // ─── Event watching ───────────────────────────────────────────────────────
  useWatchContractEvent({
    address: contract,
    abi: SOVEREIGN_AGENT_ABI,
    eventName: "AgentWoke",
    onLogs(logs) {
      for (const l of logs) {
        const { wakeCount, jobId, block: blk } = l.args as any;
        setWakeEvents((prev) => [{ wakeCount, jobId, block: blk }, ...prev].slice(0, 20));
        addLog("sched", `AgentWoke #${wakeCount} — jobId ${(jobId as string).slice(0,10)}… @ block ${blk}`);
        refetchWake();
      }
    },
    enabled: !!contract,
  });

  useWatchContractEvent({
    address: contract,
    abi: SOVEREIGN_AGENT_ABI,
    eventName: "ResultReceived",
    onLogs(logs) {
      for (const l of logs) {
        const { jobId } = l.args as any;
        addLog("tee", `ResultReceived — jobId ${(jobId as string).slice(0,10)}… TEE callback delivered`);
      }
    },
    enabled: !!contract,
  });

  useWatchContractEvent({
    address: contract,
    abi: SOVEREIGN_AGENT_ABI,
    eventName: "AgentStopped",
    onLogs() { addLog("warn", "AgentStopped event received"); refetchRunning(); },
    enabled: !!contract,
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const addLog = useCallback((type: LogEntry["type"], msg: string) => {
    setLogs((prev) => [{ ts: nowTs(), type, msg }, ...prev].slice(0, 200));
  }, []);

  async function send(label: string, fn: () => Promise<`0x${string}`>) {
    try {
      addLog("info", `Sending ${label}…`);
      const hash = await fn();
      setPendingTx(hash);
      setTxLabel(label);
      addLog("info", `${label} submitted: ${hash.slice(0, 18)}…`);
    } catch (e: any) {
      addLog("err", `${label} failed: ${e.shortMessage ?? e.message ?? "unknown error"}`);
    }
  }

  const connectMetaMask = async () => {
    try {
      connect({ connector: metaMask() });
      addLog("info", "MetaMask connection requested…");
    } catch (e: any) {
      addLog("err", `Connect failed: ${e.message}`);
    }
  };

  const switchToRitual = () => {
    switchChain({ chainId: ritualChain.id });
    addLog("info", "Switching to Ritual Chain (1979)…");
  };

  const saveContract = () => {
    if (!isAddress(contractAddr)) {
      addLog("err", "Invalid contract address");
      return;
    }
    setSavedAddr(contractAddr as `0x${string}`);
    addLog("ok", `Contract loaded: ${contractAddr}`);
  };

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Sovereign Agent · Ritual Chain</title>
        <meta name="description" content="Autonomous AI agent on Ritual Chain — no keeper, no cron, no server." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.app}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <path d="M15 2L26 8V22L15 28L4 22V8L15 2Z"
                fill="rgba(124,92,252,.18)" stroke="#7c5cfc" strokeWidth="1.2"/>
              <path d="M15 8L21 11.5V18.5L15 22L9 18.5V11.5L15 8Z"
                fill="rgba(124,92,252,.32)" stroke="#7c5cfc" strokeWidth=".8"/>
              <circle cx="15" cy="15" r="3" fill="#7c5cfc"/>
            </svg>
            <div>
              <div className={styles.logoTitle}>SovereignAgent.sol</div>
              <div className={styles.logoSub}>RITUAL CHAIN · PRECOMPILE 0x080C</div>
            </div>
          </div>

          <div className={styles.headerRight}>
            {isConnected && isRitual && (
              <div className={styles.chainBadge}>
                ⬡ Chain 1979
              </div>
            )}
            {isConnected && !isRitual && (
              <button className={styles.btnWarn} onClick={switchToRitual}>
                Switch to Ritual Chain
              </button>
            )}
            {isConnected ? (
              <div className={styles.walletRow}>
                {userBalance && (
                  <span className={styles.balance}>
                    {fmtEth(userBalance.value)} RITUAL
                  </span>
                )}
                <button className={styles.btnAddr} onClick={() => disconnect()}>
                  {fmtAddr(address!)}
                </button>
              </div>
            ) : (
              <button className={styles.btnConnect} onClick={connectMetaMask}>
                <MetaMaskIcon /> Connect MetaMask
              </button>
            )}
          </div>
        </header>

        {/* ── Network warning ── */}
        {isConnected && !isRitual && (
          <div className={styles.networkBanner}>
            ⚠ Connected to wrong network (Chain ID: {chainId}).
            <button onClick={switchToRitual}>Switch to Ritual Chain →</button>
          </div>
        )}

        {/* ── Contract loader ── */}
        {isConnected && isRitual && (
          <div className={styles.contractLoader}>
            <span className={styles.loaderLabel}>Contract address</span>
            <input
              className={styles.addrInput}
              value={contractAddr}
              onChange={(e) => setContractAddr(e.target.value)}
              placeholder="0x… deployed SovereignAgent address"
            />
            <button className={styles.btnSecondary} onClick={saveContract}>
              Load →
            </button>
            {savedAddr && (
              <a
                href={`https://explorer.ritualfoundation.org/address/${savedAddr}`}
                target="_blank" rel="noopener noreferrer"
                className={styles.explorerLink}
              >
                Explorer ↗
              </a>
            )}
          </div>
        )}

        <div className={styles.body}>
          {/* ── Sidebar ── */}
          <aside className={styles.sidebar}>
            <Section label="Chain">
              <Row k="RPC" v="rpc.ritualfoundation.org" />
              <Row k="Chain ID" v="1979" />
              <Row k="Block time" v="~350ms" />
              <Row k="Status" v={isConnected && isRitual ? "Connected" : "Disconnected"}
                color={isConnected && isRitual ? "green" : "muted"} />
            </Section>
            <Section label="Wallet">
              <Row k="Address" v={address ? fmtAddr(address) : "—"} />
              <Row k="Balance" v={userBalance ? `${fmtEth(userBalance.value)} RITUAL` : "—"} color="green" />
            </Section>
            {contract && (
              <>
                <Section label="Agent">
                  <Row k="Running" v={isRunning === undefined ? "…" : isRunning ? "YES" : "NO"}
                    color={isRunning ? "green" : "red"} />
                  <Row k="Wakeups" v={wakeCount !== undefined ? wakeCount.toString() : "…"} color="ritual" />
                  <Row k="Wake delay" v={delay !== undefined ? `${delay} blks` : "…"} />
                  <Row k="Balance" v={contractBalance ? `${fmtEth(contractBalance.value)} RITUAL` : "…"} />
                </Section>
                <Section label="Precompiles">
                  <PcBadge addr="0x080C" label="Sovereign" active />
                  <PcBadge addr="0x56e7" label="Scheduler" />
                  <PcBadge addr="0x5A16" label="AsyncDelivery" />
                </Section>
              </>
            )}
          </aside>

          {/* ── Main ── */}
          <main className={styles.main}>
            {!isConnected ? (
              <ConnectPrompt onConnect={connectMetaMask} />
            ) : !isRitual ? (
              <NetworkPrompt onSwitch={switchToRitual} />
            ) : !contract ? (
              <LoadPrompt />
            ) : (
              <>
                {/* Tabs */}
                <div className={styles.tabs}>
                  {(["control","contract","events","log"] as const).map((t) => (
                    <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
                      onClick={() => setTab(t)}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* ── Control Tab ── */}
                {tab === "control" && (
                  <div className={styles.panel}>
                    {/* Status */}
                    <div className={`${styles.statusBanner} ${isRunning ? styles.statusRunning : styles.statusIdle}`}>
                      <div className={`${styles.dot} ${isRunning ? styles.dotRunning : styles.dotIdle}`} />
                      {isRunning
                        ? `Agent loop active — wakeUp() fires every ${delay ?? "…"} blocks (~${((Number(delay ?? 50) * 0.35)).toFixed(0)}s)`
                        : "Agent stopped — call start() to begin the autonomous loop"}
                    </div>

                    {/* Metrics */}
                    <div className={styles.metrics}>
                      <Metric label="Wakeups" value={wakeCount?.toString() ?? "…"} color="ritual" />
                      <Metric label="Block delay" value={delay?.toString() ?? "…"} sub="blocks" />
                      <Metric label="RITUAL bal" value={contractBalance ? fmtEth(contractBalance.value) : "…"} color="teal" />
                      <Metric label="Owner" value={isOwner ? "You" : owner ? fmtAddr(owner) : "…"}
                        color={isOwner ? "green" : undefined} />
                    </div>

                    {/* Current prompt */}
                    {agentPrompt && (
                      <div className={styles.promptBox}>
                        <div className={styles.promptLabel}>Active prompt</div>
                        <div className={styles.promptText}>{agentPrompt}</div>
                      </div>
                    )}

                    {/* Controls — only for owner */}
                    {isOwner ? (
                      <div className={styles.controlSection}>
                        <div className={styles.sectionTitle}>Start agent</div>
                        <textarea
                          className={styles.promptInput}
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          rows={3}
                          placeholder="Agent system prompt…"
                        />
                        <div className={styles.inputRow}>
                          <label className={styles.inputLabel}>Wake delay (blocks)</label>
                          <input className={styles.numInput} type="number" min={1} max={1000}
                            value={wakeDelay} onChange={(e) => setWakeDelay(e.target.value)} />
                          <span className={styles.inputHint}>
                            ~{(Number(wakeDelay) * 0.35).toFixed(1)}s
                          </span>
                        </div>
                        <div className={styles.btnRow}>
                          <button className={styles.btnPrimary}
                            disabled={!!isRunning || txPending}
                            onClick={() => send("start()", () => writeContractAsync({
                              address: contract!, abi: SOVEREIGN_AGENT_ABI,
                              functionName: "start",
                              args: [prompt, parseInt(wakeDelay) as any],
                            }))}>
                            start() →
                          </button>
                          <button className={styles.btnDanger}
                            disabled={!isRunning || txPending}
                            onClick={() => send("stop()", () => writeContractAsync({
                              address: contract!, abi: SOVEREIGN_AGENT_ABI,
                              functionName: "stop",
                            }))}>
                            stop()
                          </button>
                        </div>

                        <div className={styles.sep} />
                        <div className={styles.sectionTitle}>Fund RitualWallet</div>
                        <div className={styles.inputRow}>
                          <input className={styles.numInput} type="number" step="0.01"
                            value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
                          <span className={styles.inputLabel}>RITUAL</span>
                          <button className={styles.btnSecondary}
                            disabled={txPending}
                            onClick={() => send("fundWallet()", () => writeContractAsync({
                              address: contract!, abi: SOVEREIGN_AGENT_ABI,
                              functionName: "fundWallet",
                              value: parseEther(fundAmount || "0"),
                            }))}>
                            Deposit + Lock →
                          </button>
                        </div>
                        <div className={styles.hint}>
                          Funds are deposited to RitualWallet (0x532F…3948) and locked
                          for precompile fee payments. Agent stops if balance runs out.
                        </div>
                      </div>
                    ) : (
                      <div className={styles.hint} style={{ marginTop: 16 }}>
                        Connect as the contract owner ({owner ? fmtAddr(owner) : "…"}) to control this agent.
                      </div>
                    )}

                    {/* Pending tx */}
                    {txPending && (
                      <div className={styles.txPending}>
                        <span className={styles.spinner} /> Waiting for {txLabel}…
                        {pendingTx && (
                          <a href={`https://explorer.ritualfoundation.org/tx/${pendingTx}`}
                            target="_blank" rel="noopener noreferrer"> View ↗</a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Contract Tab ── */}
                {tab === "contract" && (
                  <div className={styles.panel}>
                    <CodeBlock filename="SovereignAgent.sol" code={CONTRACT_SOURCE} />
                  </div>
                )}

                {/* ── Events Tab ── */}
                {tab === "events" && (
                  <div className={styles.panel}>
                    <div className={styles.sectionTitle} style={{ marginBottom: 12 }}>
                      Live AgentWoke events
                    </div>
                    {wakeEvents.length === 0 ? (
                      <div className={styles.emptyState}>
                        No wakeup events yet. Start the agent to begin.
                      </div>
                    ) : (
                      <div className={styles.eventList}>
                        {wakeEvents.map((e, i) => (
                          <div key={i} className={styles.eventRow}>
                            <span className={styles.evBadge}>#{e.wakeCount.toString()}</span>
                            <span className={styles.evJobId}>
                              {(e.jobId as string).slice(0, 18)}…
                            </span>
                            <span className={styles.evBlock}>block {e.block.toString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.sep} />
                    <div className={styles.sectionTitle} style={{ marginBottom: 8 }}>
                      Last job ID
                    </div>
                    <div className={styles.monoBox}>
                      {lastJobId ? lastJobId.toString() : "—"}
                    </div>
                  </div>
                )}

                {/* ── Log Tab ── */}
                {tab === "log" && (
                  <div className={styles.panel}>
                    <div className={styles.logHeader}>
                      <span className={styles.sectionTitle}>Transaction log</span>
                      <button className={styles.btnSecondary}
                        style={{ padding: "3px 10px", fontSize: 11 }}
                        onClick={() => setLogs([{ ts: nowTs(), type: "info", msg: "Log cleared." }])}>
                        clear
                      </button>
                    </div>
                    <div className={styles.logTerminal}>
                      {logs.map((l, i) => (
                        <div key={i} className={styles.logLine}>
                          <span className={styles.logTs}>{l.ts}</span>
                          <span className={`${styles.logTag} ${styles[`tag_${l.type}`]}`}>
                            [{l.type.toUpperCase().padEnd(4)}]
                          </span>
                          <span className={styles.logMsg}>{l.msg}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function MetaMaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 35 33" fill="none" style={{ marginRight: 6 }}>
      <path d="M32.96 1L19.43 10.67l2.53-5.94L32.96 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25"/>
      <path d="M2.04 1l13.4 9.75-2.4-5.99L2.04 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M28.2 23.53l-3.6 5.5 7.7 2.12 2.21-7.48-6.3-.14z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M.5 23.67l2.2 7.48 7.68-2.12-3.58-5.5-6.3.14z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M10 14.49l-2.15 3.24 7.66.35-.27-8.24L10 14.49z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M25 14.49l-5.3-4.73-.17 8.32 7.63-.35L25 14.49z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M10.38 29.03l4.64-2.22-4-3.12-.64 5.34z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
      <path d="M20 26.81l4.62 2.22-.63-5.34-4 3.12z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
    </svg>
  );
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className={styles.centerPrompt}>
      <div className={styles.promptHex}>⬡</div>
      <h2>Connect your wallet</h2>
      <p>MetaMask required to interact with the Sovereign Agent contract on Ritual Chain.</p>
      <button className={styles.btnConnect} onClick={onConnect}>
        <MetaMaskIcon /> Connect MetaMask
      </button>
      <div className={styles.promptNote}>
        Need testnet RITUAL? Visit{" "}
        <a href="https://faucet.ritualfoundation.org" target="_blank" rel="noopener noreferrer">
          faucet.ritualfoundation.org ↗
        </a>
      </div>
    </div>
  );
}

function NetworkPrompt({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className={styles.centerPrompt}>
      <div className={styles.promptHex} style={{ color: "var(--amber)" }}>⚠</div>
      <h2>Wrong network</h2>
      <p>Switch to Ritual Chain (Chain ID 1979) to use this app.</p>
      <button className={styles.btnWarn} onClick={onSwitch}>Switch to Ritual Chain →</button>
      <div className={styles.promptNote}>
        RPC: <code>https://rpc.ritualfoundation.org</code>
      </div>
    </div>
  );
}

function LoadPrompt() {
  return (
    <div className={styles.centerPrompt}>
      <div className={styles.promptHex}>⬡</div>
      <h2>Load a contract</h2>
      <p>Paste your deployed SovereignAgent address above to begin.</p>
      <div className={styles.promptNote}>
        Haven&apos;t deployed yet?{" "}
        <a href="https://github.com/ritual-foundation/ritual-dapp-skills" target="_blank" rel="noopener noreferrer">
          See the deploy guide ↗
        </a>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.sideSection}>
      <div className={styles.sideLabel}>{label}</div>
      {children}
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className={styles.sideRow}>
      <span className={styles.sideKey}>{k}</span>
      <span className={`${styles.sideVal} ${color ? styles[`c_${color}`] : ""}`}>{v}</span>
    </div>
  );
}

function PcBadge({ addr, label, active }: { addr: string; label: string; active?: boolean }) {
  return (
    <div className={`${styles.pcBadge} ${active ? styles.pcBadgeActive : ""}`}>
      <span>{active ? "⬡" : "◇"}</span>
      <div>
        <div>{label}</div>
        <div className={styles.pcAddr}>{addr}…</div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={`${styles.metricValue} ${color ? styles[`c_${color}`] : ""}`}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function CodeBlock({ filename, code }: { filename: string; code: string }) {
  return (
    <div className={styles.codeWrap}>
      <div className={styles.codeHeader}>
        <span className={styles.codeFile}>{filename}</span>
        <span className={styles.codeLang}>Solidity ^0.8.20 · Ritual Chain 1979</span>
      </div>
      <pre className={styles.code}>{code}</pre>
    </div>
  );
}

const CONTRACT_SOURCE = `// SPDX-License-Identifier: MIT
// No API calls. No keeper. No server. Fully on-chain.
pragma solidity ^0.8.20;

contract SovereignAgent {
    IScheduler public constant SCHEDULER =
        IScheduler(0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B);
    ISovereignPrecompile public constant SOV_PRECOMPILE =
        ISovereignPrecompile(0x000000000000000000000000000000000000080C);
    address public constant ASYNC_DELIVERY =
        0x5A16214fF555848411544b005f7Ac063742f39F6;

    string  public agentPrompt;
    uint256 public wakeCount;
    uint32  public wakeDelay = 50;   // ~17.5 seconds
    bool    public isRunning;
    bytes32 public lastJobId;

    event AgentWoke(uint256 indexed wakeCount, bytes32 jobId, uint256 block);
    event ResultReceived(bytes32 indexed jobId, bytes result);

    // 1. Owner starts the autonomous loop
    function start(string calldata prompt, uint32 delay) external onlyOwner {
        agentPrompt = prompt;
        wakeDelay   = delay;
        isRunning   = true;
        _scheduleNext();
    }

    // 2. Scheduler fires this — no human or cron needed
    function wakeUp(uint256 executionIndex) external {
        require(msg.sender == address(SCHEDULER));
        if (!isRunning) return;
        wakeCount++;
        lastJobId = SOV_PRECOMPILE.runAgent(
            "claude-code", agentPrompt, address(this));
        emit AgentWoke(wakeCount, lastJobId, block.number);
        _scheduleNext(); // perpetual loop
    }

    // 3. TEE delivers result — Phase 2 callback
    function onSovereignAgentResult(bytes32 jobId, bytes calldata result)
        external {
        require(msg.sender == ASYNC_DELIVERY);
        emit ResultReceived(jobId, result);
    }

    function stop() external onlyOwner { isRunning = false; }
    function fundWallet() external payable onlyOwner { ... }
    function _scheduleNext() internal { ... }
}`;
