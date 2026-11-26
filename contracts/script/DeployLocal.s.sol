// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {Countersign} from "../src/Countersign.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {ISkillRegistry} from "../src/interfaces/ISkillRegistry.sol";
import {MockAgentID} from "../test/mocks/MockAgentID.sol";

/// @notice Local stack for end-to-end runs on a bare anvil. There is no Agent ID on any testnet, so this
///         deploys MockAgentID (same rules as the real registry) and gives anvil accounts 0–4 the handles
///         alice, bob, carol, dave and erin. Account 9 is the attester.
///
///   anvil &
///   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// The keys below are anvil's published development keys. They are worthless; never use them elsewhere.
contract DeployLocal is Script {
    uint256 internal constant ANVIL_PK0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ANVIL_ATTESTER = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; // account 9

    function run() external {
        require(block.chainid == 31337, "DeployLocal is for anvil only");
        address deployer = vm.addr(ANVIL_PK0);
        address[5] memory holders = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
        ];
        string[5] memory handles = ["alice", "bob", "carol", "dave", "erin"];

        vm.startBroadcast(ANVIL_PK0);
        MockAgentID agentId = new MockAgentID();
        for (uint256 i; i < holders.length; ++i) {
            agentId.mint(holders[i], handles[i]);
        }
        SkillRegistry registry = new SkillRegistry(IAgentID(address(agentId)), deployer, ANVIL_ATTESTER);
        Countersign countersign = new Countersign(IAgentID(address(agentId)), ISkillRegistry(address(registry)));
        vm.stopBroadcast();

        console2.log("MockAgentID  ", address(agentId));
        console2.log("SkillRegistry", address(registry));
        console2.log("Countersign  ", address(countersign));

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "agentId", address(agentId));
        vm.serializeAddress(k, "owner", deployer);
        vm.serializeAddress(k, "attester", ANVIL_ATTESTER);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "skillRegistry", address(registry));
        string memory json = vm.serializeAddress(k, "countersign", address(countersign));
        vm.writeJson(json, "deployments/31337.json");
    }
}
