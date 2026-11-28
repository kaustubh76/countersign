// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {Countersign} from "../src/Countersign.sol";
import {GuardedExecutor} from "../src/GuardedExecutor.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {ISkillRegistry} from "../src/interfaces/ISkillRegistry.sol";

/// @notice Deploys SkillRegistry, Countersign and GuardedExecutor (in that order: deployer nonces 0, 1, 2)
///         against the real Agent ID registry.
///
///   Dry run (simulates only):  forge script script/Deploy.s.sol --rpc-url bsc
///   Broadcast:                 forge script script/Deploy.s.sol --rpc-url bsc --broadcast
///
/// Env: DEPLOYER_PRIVATE_KEY, ATTESTER_ADDRESS; optional REGISTRY_OWNER (defaults to the deployer)
///      and AGENT_ID_ADDRESS (defaults to the BSC registry, and must equal it on chain 56).
/// Writes deployments/<chainId>.json. That file is gitignored; the README address table is authoritative.
contract Deploy is Script {
    address internal constant AGENT_ID_BSC = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (SkillRegistry registry, Countersign countersign, GuardedExecutor executor) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("REGISTRY_OWNER", deployer);
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        address agentId = vm.envOr("AGENT_ID_ADDRESS", AGENT_ID_BSC);

        // Stale same-name copies of the registry exist on BSC, so never deploy against anything else.
        if (block.chainid == 56) require(agentId == AGENT_ID_BSC, "chain 56: AGENT_ID must be 0x60B9...022F");
        require(agentId.code.length > 0, "AGENT_ID has no code on this chain");
        require(attester != address(0), "ATTESTER_ADDRESS unset");
        require(attester != deployer && attester != owner, "attester must be a distinct key");

        console2.log("chainId   ", block.chainid);
        console2.log("deployer  ", deployer);
        console2.log("owner     ", owner);
        console2.log("attester  ", attester);
        console2.log("agentId   ", agentId);

        vm.startBroadcast(pk);
        registry = new SkillRegistry(IAgentID(agentId), owner, attester);
        countersign = new Countersign(IAgentID(agentId), ISkillRegistry(address(registry)));
        executor = new GuardedExecutor(ISkillRegistry(address(registry)));
        vm.stopBroadcast();

        console2.log("SkillRegistry  ", address(registry));
        console2.log("Countersign    ", address(countersign));
        console2.log("GuardedExecutor", address(executor));
        _write(agentId, owner, attester, deployer, address(registry), address(countersign), address(executor));
    }

    function _write(
        address agentId,
        address owner,
        address attester,
        address deployer,
        address registry,
        address countersign,
        address executor
    ) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "agentId", agentId);
        vm.serializeAddress(k, "owner", owner);
        vm.serializeAddress(k, "attester", attester);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "skillRegistry", registry);
        vm.serializeAddress(k, "countersign", countersign);
        string memory json = vm.serializeAddress(k, "guardedExecutor", executor);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
