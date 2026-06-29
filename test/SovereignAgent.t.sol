// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SovereignAgent.sol";

contract SovereignAgentTest is Test {
    SovereignAgent agent;
    address owner  = address(this);
    address notOwner = address(0xBEEF);

    address constant SCHEDULER     = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;
    address constant SOV_PRECOMPILE = 0x000000000000000000000000000000000000080C;
    address constant RITUAL_WALLET  = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;
    address constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    bytes32 constant MOCK_JOB_ID = bytes32(uint256(0xDEAD));

    function setUp() public {
        // Mock RitualWallet so deploy doesn't revert
        vm.mockCall(RITUAL_WALLET, abi.encodeWithSelector(
            IRitualWallet.deposit.selector), abi.encode());
        vm.mockCall(RITUAL_WALLET, abi.encodeWithSelector(
            IRitualWallet.lock.selector, uint256(0)), abi.encode());

        // Mock Scheduler for start()
        vm.mockCall(SCHEDULER, abi.encodeWithSelector(
            IScheduler.schedule.selector), abi.encode(uint256(1)));

        agent = new SovereignAgent();
    }

    // ── Ownership ────────────────────────────────────────────────────────────
    function test_OwnerIsDeployer() public view {
        assertEq(agent.owner(), owner);
    }

    function test_OnlyOwnerCanStart() public {
        vm.prank(notOwner);
        vm.expectRevert(SovereignAgent.OnlyOwner.selector);
        agent.start("prompt", 50);
    }

    function test_OnlyOwnerCanStop() public {
        _startAgent();
        vm.prank(notOwner);
        vm.expectRevert(SovereignAgent.OnlyOwner.selector);
        agent.stop();
    }

    // ── Start / Stop ─────────────────────────────────────────────────────────
    function test_StartSetsState() public {
        _startAgent();
        assertTrue(agent.isRunning());
        assertEq(agent.agentPrompt(), "test prompt");
        assertEq(agent.wakeDelay(), 50);
    }

    function test_StartEmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit SovereignAgent.AgentStarted("test prompt", 50);
        _startAgent();
    }

    function test_CannotStartTwice() public {
        _startAgent();
        vm.expectRevert(SovereignAgent.AlreadyRunning.selector);
        agent.start("another prompt", 100);
    }

    function test_StopSetsIsRunningFalse() public {
        _startAgent();
        agent.stop();
        assertFalse(agent.isRunning());
    }

    // ── WakeUp ───────────────────────────────────────────────────────────────
    function test_WakeUpOnlyFromScheduler() public {
        _startAgent();
        vm.prank(notOwner);
        vm.expectRevert(SovereignAgent.OnlyScheduler.selector);
        agent.wakeUp(0);
    }

    function test_WakeUpIncrementsCount() public {
        _startAgent();
        _mockWakeUp();
        assertEq(agent.wakeCount(), 1);
    }

    function test_WakeUpEmitsEvent() public {
        _startAgent();
        vm.mockCall(SOV_PRECOMPILE, abi.encodeWithSelector(
            ISovereignPrecompile.runAgent.selector),
            abi.encode(MOCK_JOB_ID));
        vm.expectEmit(true, false, false, false);
        emit SovereignAgent.AgentWoke(1, MOCK_JOB_ID, block.number);
        vm.prank(SCHEDULER);
        agent.wakeUp(0);
    }

    function test_WakeUpNoopWhenStopped() public {
        _startAgent();
        agent.stop();
        uint256 countBefore = agent.wakeCount();
        vm.prank(SCHEDULER);
        agent.wakeUp(0); // should be a noop
        assertEq(agent.wakeCount(), countBefore);
    }

    // ── Callback ─────────────────────────────────────────────────────────────
    function test_CallbackOnlyFromAsyncDelivery() public {
        vm.prank(notOwner);
        vm.expectRevert(SovereignAgent.OnlyAsyncDelivery.selector);
        agent.onSovereignAgentResult(MOCK_JOB_ID, "fake result");
    }

    function test_CallbackStoresResult() public {
        bytes memory result = abi.encode("Block 1234 summary: 42 txns");
        vm.prank(ASYNC_DELIVERY);
        agent.onSovereignAgentResult(MOCK_JOB_ID, result);

        assertEq(agent.lastResult(), result);
        assertEq(agent.results(MOCK_JOB_ID), result);
    }

    function test_CallbackEmitsEvent() public {
        bytes memory result = "agent output";
        vm.expectEmit(true, false, false, true);
        emit SovereignAgent.ResultReceived(MOCK_JOB_ID, result);
        vm.prank(ASYNC_DELIVERY);
        agent.onSovereignAgentResult(MOCK_JOB_ID, result);
    }

    // ── Config ───────────────────────────────────────────────────────────────
    function test_SetPrompt() public {
        _startAgent();
        agent.setPrompt("new prompt");
        assertEq(agent.agentPrompt(), "new prompt");
    }

    function test_SetWakeDelay() public {
        agent.setWakeDelay(100);
        assertEq(agent.wakeDelay(), 100);
    }

    function test_TransferOwnership() public {
        agent.transferOwnership(notOwner);
        assertEq(agent.owner(), notOwner);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _startAgent() internal {
        vm.mockCall(SCHEDULER, abi.encodeWithSelector(
            IScheduler.schedule.selector), abi.encode(uint256(1)));
        agent.start("test prompt", 50);
    }

    function _mockWakeUp() internal {
        vm.mockCall(SOV_PRECOMPILE, abi.encodeWithSelector(
            ISovereignPrecompile.runAgent.selector),
            abi.encode(MOCK_JOB_ID));
        vm.mockCall(SCHEDULER, abi.encodeWithSelector(
            IScheduler.schedule.selector), abi.encode(uint256(2)));
        vm.prank(SCHEDULER);
        agent.wakeUp(0);
    }
}
