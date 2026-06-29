// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IScheduler {
    function schedule(
        address target,
        bytes calldata data,
        uint32 delayBlocks
    ) external returns (uint256 callId);
}

interface ISovereignPrecompile {
    function runAgent(
        string calldata harness,
        string calldata prompt,
        address callback
    ) external returns (bytes32 jobId);
}

interface IRitualWallet {
    function deposit() external payable;
    function lock(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function lockedBalanceOf(address account) external view returns (uint256);
}

/// @title SovereignAgent
/// @notice Autonomous on-chain AI agent using Ritual Chain precompiles.
///         No keeper. No cron. No server. Self-perpetuating loop.
contract SovereignAgent {
    // ─── System contracts ───────────────────────────────────────────────────
    IScheduler public constant SCHEDULER =
        IScheduler(0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B);

    ISovereignPrecompile public constant SOV_PRECOMPILE =
        ISovereignPrecompile(0x000000000000000000000000000000000000080C);

    IRitualWallet public constant RITUAL_WALLET =
        IRitualWallet(0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948);

    address public constant ASYNC_DELIVERY =
        0x5A16214fF555848411544b005f7Ac063742f39F6;

    // ─── State ──────────────────────────────────────────────────────────────
    address public owner;
    string  public agentPrompt;
    string  public agentHarness;
    uint256 public wakeCount;
    uint32  public wakeDelay;
    bool    public isRunning;
    bytes32 public lastJobId;
    bytes   public lastResult;

    mapping(bytes32 => bytes) public results;

    // ─── Events ─────────────────────────────────────────────────────────────
    event AgentStarted(string prompt, uint32 delay);
    event AgentWoke(uint256 indexed wakeCount, bytes32 jobId, uint256 block);
    event ResultReceived(bytes32 indexed jobId, bytes result);
    event AgentStopped();

    // ─── Errors ─────────────────────────────────────────────────────────────
    error OnlyOwner();
    error OnlyScheduler();
    error OnlyAsyncDelivery();
    error AlreadyRunning();
    error NotRunning();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        agentHarness = "claude-code";
        wakeDelay = 50;
    }

    /// @notice Start the autonomous agent loop.
    /// @param prompt  System prompt injected into the TEE CLI harness.
    /// @param delay   Blocks between wakeups (~350ms each on Ritual).
    function start(string calldata prompt, uint32 delay) external onlyOwner {
        if (isRunning) revert AlreadyRunning();
        agentPrompt = prompt;
        wakeDelay   = delay;
        isRunning   = true;
        _scheduleNext();
        emit AgentStarted(prompt, delay);
    }

    /// @notice Called by the Scheduler at each wakeup interval.
    ///         Invokes Sovereign Agent precompile (0x080C) in a TEE.
    function wakeUp(uint256 executionIndex) external {
        if (msg.sender != address(SCHEDULER)) revert OnlyScheduler();
        if (!isRunning) return;

        wakeCount++;
        lastJobId = SOV_PRECOMPILE.runAgent(
            agentHarness,
            agentPrompt,
            address(this)
        );

        emit AgentWoke(wakeCount, lastJobId, block.number);
        _scheduleNext();
    }

    /// @notice Phase 2 callback — TEE delivers signed result here.
    function onSovereignAgentResult(
        bytes32 jobId,
        bytes calldata result
    ) external {
        if (msg.sender != ASYNC_DELIVERY) revert OnlyAsyncDelivery();
        lastResult = result;
        results[jobId] = result;
        emit ResultReceived(jobId, result);
    }

    /// @notice Stop the agent. Loop will not reschedule after current cycle.
    function stop() external onlyOwner {
        isRunning = false;
        emit AgentStopped();
    }

    /// @notice Update the prompt without restarting.
    function setPrompt(string calldata prompt) external onlyOwner {
        agentPrompt = prompt;
    }

    /// @notice Update the wake delay.
    function setWakeDelay(uint32 delay) external onlyOwner {
        wakeDelay = delay;
    }

    /// @notice Deposit RITUAL into wallet and lock for precompile fees.
    function fundWallet() external payable onlyOwner {
        RITUAL_WALLET.deposit{value: msg.value}();
        RITUAL_WALLET.lock(msg.value);
    }

    /// @notice Transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Withdraw unlocked funds from RitualWallet.
    function withdrawWallet(uint256 amount) external onlyOwner {
        RITUAL_WALLET.withdraw(amount);
        payable(owner).transfer(amount);
    }

    receive() external payable {}

    // ─── Internal ───────────────────────────────────────────────────────────
    function _scheduleNext() internal {
        SCHEDULER.schedule(
            address(this),
            abi.encodeWithSelector(this.wakeUp.selector, wakeCount),
            wakeDelay
        );
    }
}
