// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SkillRegistry} from "../../src/SkillRegistry.sol";
import {Countersign} from "../../src/Countersign.sol";
import {AgentIdGated} from "../../src/AgentIdGated.sol";
import {IAgentID} from "../../src/interfaces/IAgentID.sol";
import {ISkillRegistry} from "../../src/interfaces/ISkillRegistry.sol";
import {OwnedTarget, PlainTarget} from "../mocks/Targets.sol";

interface IHandleRegistryExtras {
    function ownerOfHandle(string calldata handle) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Runs against the real Agent ID registry on BSC mainnet, on a local fork. Nothing is broadcast.
///         Opt-in, because it needs network access:
///           RUN_FORK_TESTS=true forge test --match-path 'test/fork/*' -vv
///         It uses BSC_ARCHIVE_RPC_URL if set, otherwise BSC_RPC_URL. A non-archive endpoint works if the
///         test finishes within about a minute of forking (0.45 s blocks age out of recent state quickly).
contract AgentIdForkTest is Test {
    address internal constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    /// Two public Agent ID holders taken from recent `Registered` events (any holders work).
    address internal constant HOLDER_A = 0x77EA590Ccd9bA2ffb2dEfc99b2bFB82DAF09017a;
    address internal constant HOLDER_B = 0xB290f0856BF95dE22FDE8e755642389FAD008CbE;
    bytes4 internal constant SOULBOUND = 0xa4420a95; // Soulbound()

    bool internal forked;

    function setUp() public {
        if (!vm.envOr("RUN_FORK_TESTS", false)) return;
        string memory rpc = vm.envOr("BSC_ARCHIVE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
    }

    /// The assumptions every other piece of COUNTERSIGN relies on, checked against the live contract.
    function test_Fork_AgentIdAssumptions() public {
        vm.skip(!forked);
        assertEq(block.chainid, 56);
        IAgentID agentId = IAgentID(AGENT_ID);

        string memory handle = agentId.handleOf(HOLDER_A);
        assertGt(bytes(handle).length, 0, "holder has a handle");
        uint256 tokenId = uint256(keccak256(bytes(handle)));
        assertEq(agentId.ownerOf(tokenId), HOLDER_A, "tokenId == keccak256(handle)");
        assertEq(IHandleRegistryExtras(AGENT_ID).ownerOfHandle(handle), HOLDER_A);
        assertEq(IHandleRegistryExtras(AGENT_ID).balanceOf(HOLDER_A), 1, "one per address");
        assertEq(bytes(agentId.handleOf(makeAddr("nobody"))).length, 0, "non-holder -> empty handle");

        vm.prank(HOLDER_A);
        vm.expectRevert(SOULBOUND);
        IHandleRegistryExtras(AGENT_ID).transferFrom(HOLDER_A, HOLDER_B, tokenId);
    }

    function test_Fork_RegisterAndCountersignWithRealAgentIds() public {
        vm.skip(!forked);
        address owner = makeAddr("owner");
        SkillRegistry registry = new SkillRegistry(IAgentID(AGENT_ID), owner, makeAddr("attester"));
        Countersign countersign = new Countersign(IAgentID(AGENT_ID), ISkillRegistry(address(registry)));
        OwnedTarget anchor = new OwnedTarget(HOLDER_A);
        PlainTarget shared = new PlainTarget();

        SkillRegistry.TargetIn[] memory t = new SkillRegistry.TargetIn[](2);
        t[0] = SkillRegistry.TargetIn({target: address(anchor), impl: address(0), maxValue: 0, flags: 1});
        t[1] = SkillRegistry.TargetIn({target: address(shared), impl: address(0), maxValue: 0, flags: 0});
        SkillRegistry.Permission[] memory p = new SkillRegistry.Permission[](1);
        p[0] = SkillRegistry.Permission({targetIndex: 0, selector: OwnedTarget.ping.selector});
        SkillRegistry.Flow[] memory f = new SkillRegistry.Flow[](0);

        vm.prank(HOLDER_A);
        bytes32 versionId = registry.register(keccak256("fork-skill"), "https://example.invalid/skill", t, p, f);
        (address registrant, uint256 registrantAgentId,) = registry.authorOf(versionId);
        assertEq(registrant, HOLDER_A);
        assertEq(registrantAgentId, uint256(keccak256(bytes(IAgentID(AGENT_ID).handleOf(HOLDER_A)))));
        (SkillRegistry.Target[] memory stored,,) = registry.getManifest(versionId);
        assertEq(stored[0].endorser, HOLDER_A, "anchor auto-endorsed for its owner");

        bytes32[] memory txs = new bytes32[](1);
        txs[0] = keccak256("a session tx");
        vm.prank(HOLDER_B);
        countersign.countersign(versionId, txs);
        assertEq(countersign.countersignCount(versionId), 1);
        assertEq(countersign.uniqueAgents(), 1);

        vm.expectRevert(Countersign.SelfCountersign.selector);
        vm.prank(HOLDER_A);
        countersign.countersign(versionId, txs);

        address nobody = makeAddr("nobody");
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAgentIdHolder.selector, nobody));
        vm.prank(nobody);
        countersign.countersign(versionId, txs);
    }
}
