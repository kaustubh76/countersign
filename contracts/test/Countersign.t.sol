// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Base} from "./Base.t.sol";
import {Countersign} from "../src/Countersign.sol";
import {AgentIdGated} from "../src/AgentIdGated.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {ISkillRegistry} from "../src/interfaces/ISkillRegistry.sol";
import {LyingAgentID} from "./mocks/MockAgentID.sol";

contract CountersignTest is Base {
    bytes32 internal versionId;

    function setUp() public override {
        super.setUp();
        versionId = _register(alice, CONTENT);
    }

    function test_Countersign_RecordsClaim() public {
        bytes32[] memory txs = _txs(3, 1);
        vm.expectEmit(true, true, true, true, address(countersign));
        emit Countersign.Countersigned(versionId, 0);
        vm.prank(bob);
        uint256 recordId = countersign.countersign(versionId, txs);
        assertEq(recordId, 0);

        Countersign.Record memory r = countersign.getRecord(0);
        assertEq(r.versionId, versionId);
        assertEq(r.agentId, _id("bob"), "agent id resolved on-chain from handleOf");
        assertEq(r.signer, bob);
        assertEq(r.blockNumber, block.number);
        assertEq(r.kind, countersign.KIND_COUNTERSIGN());
        assertEq(r.txHashes.length, 3);
        for (uint256 i; i < 3; ++i) {
            assertEq(r.txHashes[i], txs[i]);
        }
        assertEq(countersign.countersignCount(versionId), 1);
        assertEq(countersign.recordCount(), 1);
        assertEq(countersign.uniqueAgents(), 1);
    }

    function test_Countersign_RejectsRegistrant() public {
        vm.expectRevert(Countersign.SelfCountersign.selector);
        vm.prank(alice);
        countersign.countersign(versionId, _txs(1, 1));
    }

    function test_Countersign_RejectsNonHolder() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAgentIdHolder.selector, mallory));
        vm.prank(mallory);
        countersign.countersign(versionId, _txs(1, 1));
    }

    function test_Countersign_RejectsUnknownVersion() public {
        bytes32 nope = keccak256("nope");
        vm.expectRevert(abi.encodeWithSelector(Countersign.UnknownVersion.selector, nope));
        vm.prank(bob);
        countersign.countersign(nope, _txs(1, 1));
    }

    function test_Countersign_OncePerAgentPerVersion() public {
        vm.startPrank(bob);
        countersign.countersign(versionId, _txs(1, 1));
        vm.expectRevert(Countersign.AlreadyCountersigned.selector);
        countersign.countersign(versionId, _txs(1, 2));
        vm.stopPrank();
    }

    /// One session can't be recycled onto several versions (e.g. near-identical re-registrations).
    function test_Countersign_TxCitableOncePerAgentAcrossVersions() public {
        bytes32 v2 = _register(alice, keccak256("example-skill-v2"));
        bytes32[] memory txs = _txs(2, 1);
        vm.prank(bob);
        countersign.countersign(versionId, txs);

        bytes32[] memory reused = new bytes32[](1);
        reused[0] = txs[1];
        vm.expectRevert(abi.encodeWithSelector(Countersign.TxAlreadyUsed.selector, txs[1]));
        vm.prank(bob);
        countersign.countersign(v2, reused);

        // Keyed per agent: carol citing bob's hash isn't blocked on-chain, so nobody can burn
        // someone else's tx. The verifier discards it anyway, because the tx is not from carol.
        vm.prank(carol);
        countersign.countersign(v2, reused);
    }

    function test_Countersign_ValidatesTxList() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(Countersign.BadTxCount.selector, 0));
        countersign.countersign(versionId, new bytes32[](0));

        vm.expectRevert(abi.encodeWithSelector(Countersign.BadTxCount.selector, 9));
        countersign.countersign(versionId, _txs(9, 1));

        bytes32[] memory withZero = _txs(2, 1);
        withZero[1] = bytes32(0);
        vm.expectRevert(Countersign.ZeroTxHash.selector);
        countersign.countersign(versionId, withZero);

        bytes32[] memory dup = _txs(3, 1);
        dup[2] = dup[0];
        vm.expectRevert(abi.encodeWithSelector(Countersign.DuplicateTxHash.selector, dup[0]));
        countersign.countersign(versionId, dup);
        vm.stopPrank();

        assertEq(countersign.recordCount(), 0);
    }

    function test_Report_RecordsAndDedupes() public {
        vm.expectEmit(true, true, true, true, address(countersign));
        emit Countersign.Reported(versionId, 0);
        vm.prank(bob);
        countersign.report(versionId, _txs(1, 7));
        Countersign.Record memory r = countersign.getRecord(0);
        assertEq(r.kind, countersign.KIND_REPORT());
        assertEq(r.signer, bob);
        assertEq(countersign.reportCount(versionId), 1);

        vm.expectRevert(Countersign.AlreadyReported.selector);
        vm.prank(bob);
        countersign.report(versionId, _txs(1, 8));

        // A countersign and a report are separate records. The verifier excludes a countersigner who
        // also reported.
        vm.prank(bob);
        countersign.countersign(versionId, _txs(1, 7));
        assertEq(countersign.countersignCount(versionId), 1);
        assertEq(countersign.uniqueAgents(), 1);
    }

    function test_Report_RejectsNonHolderAndUnknownVersion() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAgentIdHolder.selector, mallory));
        vm.prank(mallory);
        countersign.report(versionId, _txs(1, 1));

        bytes32 nope = keccak256("nope");
        vm.expectRevert(abi.encodeWithSelector(Countersign.UnknownVersion.selector, nope));
        vm.prank(bob);
        countersign.report(nope, _txs(1, 1));
    }

    function test_Views_Paging() public {
        vm.prank(bob);
        countersign.countersign(versionId, _txs(1, 1));
        vm.prank(carol);
        countersign.countersign(versionId, _txs(2, 2));
        vm.prank(dave);
        countersign.report(versionId, _txs(1, 3));
        vm.prank(dave);
        countersign.countersign(versionId, _txs(1, 4));

        (Countersign.Record[] memory page, uint256 total) = countersign.countersignsOf(versionId, 0, 2);
        assertEq(total, 3);
        assertEq(page.length, 2);
        assertEq(page[0].signer, bob);
        assertEq(page[1].signer, carol);
        assertEq(page[1].txHashes.length, 2);
        (page,) = countersign.countersignsOf(versionId, 2, 10);
        assertEq(page.length, 1);
        assertEq(page[0].signer, dave);
        (page,) = countersign.countersignsOf(versionId, 3, 10);
        assertEq(page.length, 0);

        (page, total) = countersign.reportsOf(versionId, 0, 10);
        assertEq(total, 1);
        assertEq(page[0].signer, dave);

        page = countersign.recordsPage(1, 2);
        assertEq(page.length, 2);
        assertEq(page[0].signer, carol);
        assertEq(page[1].kind, countersign.KIND_REPORT());
        assertEq(countersign.recordsPage(4, 1).length, 0);
        assertEq(countersign.uniqueAgents(), 3);
    }

    function test_DefensiveOwnerCheck() public {
        Countersign lying = new Countersign(IAgentID(address(new LyingAgentID())), ISkillRegistry(address(registry)));
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAgentIdHolder.selector, bob));
        vm.prank(bob);
        lying.countersign(versionId, _txs(1, 1));
    }

    function test_Constructor_RejectsNonContracts() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAContract.selector, address(0x1234)));
        new Countersign(IAgentID(address(0x1234)), ISkillRegistry(address(registry)));
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAContract.selector, address(0x5678)));
        new Countersign(IAgentID(address(agentIdNft)), ISkillRegistry(address(0x5678)));
    }

    function test_RejectsNativeValue() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(countersign).call{value: 1}("");
        assertFalse(ok, "no receive / fallback");
        assertEq(address(countersign).balance, 0);
    }

    function testFuzz_StoresExactTxHashes(uint256 salt, uint8 n) public {
        n = uint8(bound(n, 1, 8));
        bytes32[] memory txs = _txs(n, salt);
        vm.prank(bob);
        uint256 recordId = countersign.countersign(versionId, txs);
        Countersign.Record memory r = countersign.getRecord(recordId);
        assertEq(r.txHashes.length, n);
        for (uint256 i; i < n; ++i) {
            assertEq(r.txHashes[i], txs[i]);
        }
    }
}
