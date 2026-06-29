// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SovereignAgent.sol";

contract DeploySovereignAgent is Script {
    // System contracts
    IRitualWallet constant WALLET =
        IRitualWallet(0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948);

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== Ritual Chain Sovereign Agent Deploy ===");
        console.log("Deployer  :", deployer);
        console.log("Chain ID  :", block.chainid);
        console.log("Block     :", block.number);

        vm.startBroadcast(deployerKey);

        // 1. Deploy contract
        SovereignAgent agent = new SovereignAgent();
        console.log("Contract  :", address(agent));

        // 2. Fund RitualWallet (0.2 RITUAL locked for precompile fees)
        uint256 fundAmount = 0.2 ether;
        if (deployer.balance >= fundAmount) {
            agent.fundWallet{value: fundAmount}();
            console.log("Funded    : 0.2 RITUAL locked in RitualWallet");
        } else {
            console.log("WARNING: Low balance - fund RitualWallet manually");
        }

        // 3. Start agent loop
        string memory prompt = vm.envOr(
            "AGENT_PROMPT",
            string("Monitor Ritual Chain activity. Every wakeup: read recent blocks, summarize events, flag anomalies, post digest.")
        );
        uint32 delay = uint32(vm.envOr("WAKE_DELAY", uint256(50)));

        agent.start(prompt, delay);
        console.log("Started   : wakeDelay =", delay, "blocks (~",
            delay * 350 / 1000, "seconds)");
        console.log("Prompt    :", prompt);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Post-Deploy Checklist ===");
        console.log("1. Verify on explorer:");
        console.log("   https://explorer.ritualfoundation.org/address/",
            address(agent));
        console.log("2. Watch for AgentWoke events every", delay, "blocks");
        console.log("3. Fund more RITUAL when balance < 0.05:");
        console.log("   cast send", address(agent),
            '"fundWallet()" --value 0.1ether --rpc-url https://rpc.ritualfoundation.org');
    }
}
