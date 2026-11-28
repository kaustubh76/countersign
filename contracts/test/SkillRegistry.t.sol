// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base} from "./Base.t.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {AgentIdGated} from "../src/AgentIdGated.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {OwnedTarget, PlainTarget, ReturnBombTarget, DirtyOwnerTarget} from "./mocks/Targets.sol";

contract SkillRegistryTest is Base {
    // ── register ──────────────────────────────────────────────────────────────────────────────────

    function test_Register_StoresVersionAndManifest() public {
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        (bytes32 manifestHash, bytes32 expectedId) = registry.computeVersionId(CONTENT, t, p, f, _id("alice"));
        assertEq(manifestHash, keccak256(abi.encode(t, p, f)), "manifestHash = keccak(abi.encode(t,p,f))");
        assertEq(expectedId, keccak256(abi.encode(CONTENT, manifestHash, _id("alice"))), "versionId formula");

        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.VersionRegistered(expectedId, CONTENT, alice, manifestHash, URI);
        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.AnchorEndorsed(expectedId, 0, alice);
        bytes32 versionId = _register(alice, CONTENT);
        assertEq(versionId, expectedId);

        SkillRegistry.Version memory v = registry.getVersion(versionId);
        assertEq(v.contentHash, CONTENT);
        assertEq(v.manifestHash, manifestHash);
        assertEq(v.registrantAgentId, _id("alice"));
        assertEq(v.registrant, alice);
        assertEq(v.registeredBlock, block.number);
        assertEq(v.registeredAt, block.timestamp);
        assertEq(v.contentURI, URI);

        (SkillRegistry.Target[] memory ts, SkillRegistry.Permission[] memory ps, SkillRegistry.Flow[] memory fs) =
            registry.getManifest(versionId);
        assertEq(ts.length, 2);
        assertEq(ts[0].target, address(anchorTarget));
        assertEq(ts[0].flags, 1);
        assertEq(ts[0].codehash, address(anchorTarget).codehash, "codehash snapshot");
        assertEq(ts[0].endorser, alice, "anchor owned by registrant is auto-endorsed");
        assertEq(ts[1].target, address(shared));
        assertEq(ts[1].maxValue, 1 ether);
        assertEq(ts[1].endorser, address(0));
        assertEq(ps.length, 2);
        assertEq(ps[1].selector, p[1].selector);
        assertEq(fs.length, 1);
        assertEq(fs[0].cap, 100e18);

        assertTrue(registry.exists(versionId));
        assertEq(registry.versionCount(), 1);
        assertEq(registry.uniqueAgents(), 1);
        (address registrant, uint256 registrantAgentId, uint64 registeredBlock) = registry.authorOf(versionId);
        assertEq(registrant, alice);
        assertEq(registrantAgentId, _id("alice"));
        assertEq(registeredBlock, block.number);
    }

    /// Squatting gains nothing: the registrant is part of the id, so bob's copy of alice's content is a
    /// different version, which pre-flight never looks up (it computes the id with the publisher).
    function test_Register_SameContentDifferentRegistrantIsDifferentVersion() public {
        bytes32 byAlice = _register(alice, CONTENT);
        bytes32 byBob = _register(bob, CONTENT);
        assertTrue(byAlice != byBob);
        (bytes32[] memory page, uint256 total) = registry.versionsByContent(CONTENT, 0, 10);
        assertEq(total, 2);
        assertEq(page[0], byAlice);
        assertEq(page[1], byBob);
        (SkillRegistry.Target[] memory ts,,) = registry.getManifest(byBob);
        assertEq(ts[0].endorser, address(0), "bob does not own alice's contract, so no endorsement");
        assertEq(registry.uniqueAgents(), 2);
    }

    function test_Register_RevertsForNonHolder() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAgentIdHolder.selector, mallory));
        _register(mallory, CONTENT);
    }

    function test_Register_RevertsOnDuplicate() public {
        bytes32 versionId = _register(alice, CONTENT);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.VersionExists.selector, versionId));
        _register(alice, CONTENT);
    }

    function test_Register_RejectsBadShape() public {
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        vm.startPrank(alice);

        vm.expectRevert(SkillRegistry.ZeroContentHash.selector);
        registry.register(bytes32(0), URI, t, p, f);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadContentURI.selector, 0));
        registry.register(CONTENT, "", t, p, f);

        string memory longUri = string(new bytes(513));
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadContentURI.selector, 513));
        registry.register(CONTENT, longUri, t, p, f);

        vm.expectRevert(SkillRegistry.EmptyManifest.selector);
        registry.register(CONTENT, URI, new SkillRegistry.TargetIn[](0), p, f);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.TooMany.selector, 17, 16));
        registry.register(CONTENT, URI, new SkillRegistry.TargetIn[](17), p, f);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.TooMany.selector, 65, 64));
        registry.register(CONTENT, URI, t, new SkillRegistry.Permission[](65), f);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.TooMany.selector, 33, 32));
        registry.register(CONTENT, URI, t, p, new SkillRegistry.Flow[](33));
        vm.stopPrank();
    }

    function test_Register_RejectsBadEntries() public {
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        vm.startPrank(alice);

        t[1].target = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAContract.selector, t[1].target));
        registry.register(CONTENT, URI, t, p, f);
        (t,,) = _manifest();

        t[1].impl = makeAddr("eoa-impl");
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAContract.selector, t[1].impl));
        registry.register(CONTENT, URI, t, p, f);
        (t,,) = _manifest();

        t[1].target = t[0].target;
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.DuplicateTarget.selector, t[0].target));
        registry.register(CONTENT, URI, t, p, f);
        (t,,) = _manifest();

        t[1].flags = 4;
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadFlags.selector, 4));
        registry.register(CONTENT, URI, t, p, f);
        (t,,) = _manifest();

        p[0].targetIndex = 2;
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadIndex.selector, 2));
        registry.register(CONTENT, URI, t, p, f);
        (, p,) = _manifest();

        f[0].kind = 2;
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadFlowKind.selector, 2));
        registry.register(CONTENT, URI, t, p, f);
        (,, f) = _manifest();

        f[0].token = address(0);
        vm.expectRevert(SkillRegistry.NativeApproval.selector);
        registry.register(CONTENT, URI, t, p, f);
        (,, f) = _manifest();

        f[0].counterparty = address(0);
        vm.expectRevert(SkillRegistry.ZeroCounterparty.selector);
        registry.register(CONTENT, URI, t, p, f);
        (,, f) = _manifest();

        f[0].cap = type(uint256).max;
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.UnlimitedCap.selector, f[0].token, f[0].counterparty));
        registry.register(CONTENT, URI, t, p, f);
        vm.stopPrank();
    }

    function test_Register_NativeTransferFlowAllowed() public {
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        f[0] = SkillRegistry.Flow({token: address(0), counterparty: makeAddr("payee"), kind: 1, cap: 0.1 ether});
        vm.prank(alice);
        registry.register(CONTENT, URI, t, p, f);
    }

    // ── anchors ───────────────────────────────────────────────────────────────────────────────────

    function test_EndorseAnchor_ByContractOwner() public {
        OwnedTarget bobsContract = new OwnedTarget(bob);
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        t[0].target = address(bobsContract);
        vm.prank(alice);
        bytes32 versionId = registry.register(CONTENT, URI, t, p, f);
        (SkillRegistry.Target[] memory ts,,) = registry.getManifest(versionId);
        assertEq(ts[0].endorser, address(0), "not auto-endorsed: owner differs from registrant");

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotTargetOwner.selector, address(bobsContract)));
        vm.prank(alice);
        registry.endorseAnchor(versionId, 0);

        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.AnchorEndorsed(versionId, 0, bob);
        vm.prank(bob);
        registry.endorseAnchor(versionId, 0);
        (ts,,) = registry.getManifest(versionId);
        assertEq(ts[0].endorser, bob);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.AlreadyEndorsed.selector, 0));
        vm.prank(bob);
        registry.endorseAnchor(versionId, 0);
    }

    function test_EndorseAnchor_Reverts() public {
        bytes32 versionId = _register(alice, CONTENT);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.UnknownVersion.selector, bytes32(uint256(1))));
        registry.endorseAnchor(bytes32(uint256(1)), 0);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadIndex.selector, 2));
        registry.endorseAnchor(versionId, 2);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotAnchor.selector, 1));
        registry.endorseAnchor(versionId, 1);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.AlreadyEndorsed.selector, 0));
        vm.prank(alice);
        registry.endorseAnchor(versionId, 0);
    }

    function test_OwnerProbe_IgnoresReturnBombsAndDirtyWords() public {
        ReturnBombTarget bomb = new ReturnBombTarget();
        DirtyOwnerTarget dirty = new DirtyOwnerTarget(alice);
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        t[0] = SkillRegistry.TargetIn({target: address(bomb), impl: address(0), maxValue: 0, flags: 1});
        t[1] = SkillRegistry.TargetIn({target: address(dirty), impl: address(0), maxValue: 0, flags: 1});
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        bytes32 versionId = registry.register(CONTENT, URI, t, p, f);
        assertLt(gasBefore - gasleft(), 2_000_000, "return bomb must not burn gas");
        (SkillRegistry.Target[] memory ts,,) = registry.getManifest(versionId);
        assertEq(ts[0].endorser, address(0));
        assertEq(ts[1].endorser, address(0), "dirty word is not an owner");
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NotTargetOwner.selector, address(dirty)));
        vm.prank(alice);
        registry.endorseAnchor(versionId, 1);
    }

    // ── attestations & owner powers ───────────────────────────────────────────────────────────────

    function test_Attest_OnlyAttesterAndStored() public {
        bytes32 versionId = _register(alice, CONTENT);
        bytes20 commit = bytes20(keccak256("checker"));
        bytes32 report = keccak256("report");

        vm.expectRevert(SkillRegistry.NotAttester.selector);
        vm.prank(alice);
        registry.attest(versionId, 0x7f, 0x7f, commit, report);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.UnknownVersion.selector, bytes32(uint256(7))));
        vm.prank(attester);
        registry.attest(bytes32(uint256(7)), 0x7f, 0x7f, commit, report);

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.BadRuleMask.selector, 0x0f, 0x1f));
        vm.prank(attester);
        registry.attest(versionId, 0x0f, 0x1f, commit, report);

        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.Attested(versionId, attester, 0x7f, 0x3f, commit, report);
        vm.prank(attester);
        registry.attest(versionId, 0x7f, 0x3f, commit, report);
        SkillRegistry.Attestation memory a = registry.getAttestation(versionId, attester);
        assertEq(a.attester, attester);
        assertEq(a.blockNumber, block.number);
        assertEq(a.rulesChecked, 0x7f);
        assertEq(a.rulesPassed, 0x3f);
        assertEq(a.checkerCommit, commit);
        assertEq(a.reportHash, report);
        assertFalse(a.revoked);

        // only your own attestation can be revoked
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NoAttestation.selector, versionId));
        registry.revokeAttestation(versionId);
        vm.prank(attester);
        registry.revokeAttestation(versionId);
        assertTrue(registry.getAttestation(versionId, attester).revoked);
        (, bool[] memory active) = registry.attestationsOf(versionId);
        assertFalse(active[0], "a revoked attestation does not count");

        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.NoAttestation.selector, bytes32(uint256(9))));
        vm.prank(attester);
        registry.revokeAttestation(bytes32(uint256(9)));
    }

    function test_MultipleAttesters_IndependentAndOnlyEnabledCount() public {
        bytes32 versionId = _register(alice, CONTENT);
        address second = makeAddr("second-attester");
        vm.prank(owner);
        registry.setAttester(second, true);
        assertEq(registry.attesterCount(), 2);

        vm.prank(attester);
        registry.attest(versionId, 0xff, 0xff, bytes20(uint160(1)), keccak256("r1"));
        vm.prank(second);
        registry.attest(versionId, 0xf7, 0xf7, bytes20(uint160(2)), keccak256("r2"));
        // a fresh attestation by the same attester replaces its previous one, without a new entry
        vm.prank(second);
        registry.attest(versionId, 0xff, 0xff, bytes20(uint160(3)), keccak256("r3"));

        (SkillRegistry.Attestation[] memory list, bool[] memory active) = registry.attestationsOf(versionId);
        assertEq(list.length, 2);
        assertEq(list[0].attester, attester);
        assertEq(list[1].attester, second);
        assertEq(list[1].reportHash, keccak256("r3"));
        assertTrue(active[0] && active[1]);

        // the owner retires the first attester: its attestation stops counting, and it can no longer attest
        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.AttesterSet(attester, false);
        vm.prank(owner);
        registry.setAttester(attester, false);
        (, active) = registry.attestationsOf(versionId);
        assertFalse(active[0]);
        assertTrue(active[1]);
        vm.expectRevert(SkillRegistry.NotAttester.selector);
        vm.prank(attester);
        registry.attest(versionId, 0xff, 0xff, bytes20(0), bytes32(0));
        // ...but it can still take back what it signed
        vm.prank(attester);
        registry.revokeAttestation(versionId);
        assertTrue(registry.getAttestation(versionId, attester).revoked);
    }

    function test_SetAttester_OnlyOwner_NoZero_Capped() public {
        address next = makeAddr("next-attester");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        registry.setAttester(next, true);

        vm.expectRevert(SkillRegistry.ZeroAttester.selector);
        vm.prank(owner);
        registry.setAttester(address(0), true);

        vm.expectEmit(true, true, true, true, address(registry));
        emit SkillRegistry.AttesterSet(next, true);
        vm.prank(owner);
        registry.setAttester(next, true);
        assertTrue(registry.isAttester(next));
        vm.prank(owner);
        registry.setAttester(next, true); // idempotent
        assertEq(registry.attesterCount(), 2);

        for (uint256 i = 2; i < registry.MAX_ATTESTERS(); ++i) {
            vm.prank(owner);
            registry.setAttester(makeAddr(string.concat("attester-", vm.toString(i))), true);
        }
        assertEq(registry.attesterCount(), registry.MAX_ATTESTERS());
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.TooMany.selector, 17, 16));
        vm.prank(owner);
        registry.setAttester(makeAddr("one-too-many"), true);
    }

    function test_CheckCall_EveryCode() public {
        bytes32 versionId = _register(alice, CONTENT);
        bytes4 ping = OwnedTarget.ping.selector;
        assertEq(registry.checkCall(versionId, address(anchorTarget), ping, 0), registry.CALL_OK());
        assertEq(registry.checkCall(versionId, address(shared), PlainTarget.ping.selector, 1 ether), registry.CALL_OK());
        assertEq(registry.checkCall(keccak256("nope"), address(anchorTarget), ping, 0), registry.CALL_UNKNOWN_VERSION());
        assertEq(registry.checkCall(versionId, address(this), ping, 0), registry.CALL_UNDECLARED_TARGET());
        assertEq(registry.checkCall(versionId, address(anchorTarget), bytes4(0xdeadbeef), 0), registry.CALL_UNDECLARED_FUNCTION());
        assertEq(registry.checkCall(versionId, address(shared), PlainTarget.ping.selector, 1 ether + 1), registry.CALL_VALUE_OVER_CAP());
        assertEq(registry.checkCall(versionId, address(anchorTarget), ping, 1), registry.CALL_VALUE_OVER_CAP());
        vm.etch(address(anchorTarget), address(shared).code);
        assertEq(registry.checkCall(versionId, address(anchorTarget), ping, 0), registry.CALL_CODE_CHANGED());
    }

    function test_Ownership_IsTwoStep() public {
        address next = makeAddr("next-owner");
        vm.prank(owner);
        registry.transferOwnership(next);
        assertEq(registry.owner(), owner, "pending until accepted");
        vm.prank(next);
        registry.acceptOwnership();
        assertEq(registry.owner(), next);
    }

    // ── views & invariants ────────────────────────────────────────────────────────────────────────

    function test_VersionsPage() public {
        bytes32 a = _register(alice, keccak256("a"));
        bytes32 b = _register(alice, keccak256("b"));
        bytes32 c = _register(bob, keccak256("c"));
        bytes32[] memory page = registry.versionsPage(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], a);
        assertEq(page[1], b);
        page = registry.versionsPage(2, 100);
        assertEq(page.length, 1);
        assertEq(page[0], c);
        assertEq(registry.versionsPage(3, 1).length, 0);
        assertEq(registry.versionsPage(0, 1000).length, 3, "limit clamps to MAX_PAGE");
        assertEq(registry.uniqueAgents(), 2);
    }

    function test_UnknownVersionViewsAreZero() public view {
        bytes32 nope = keccak256("nope");
        assertFalse(registry.exists(nope));
        assertEq(registry.getVersion(nope).registeredBlock, 0);
        assertEq(registry.getAttestation(nope, attester).blockNumber, 0);
        (SkillRegistry.Attestation[] memory list,) = registry.attestationsOf(nope);
        assertEq(list.length, 0);
        (address r,, uint64 b) = registry.authorOf(nope);
        assertEq(r, address(0));
        assertEq(b, 0);
    }

    function test_RejectsNativeValue() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(registry).call{value: 1}("");
        assertFalse(ok, "no receive / fallback");
        assertEq(address(registry).balance, 0);
    }

    function test_Constructor_RejectsNonContractAgentId() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGated.NotAContract.selector, address(0x1234)));
        new SkillRegistry(IAgentID(address(0x1234)), owner, attester);
    }

    function testFuzz_ComputeVersionIdMatchesRegister(bytes32 contentHash, uint96 maxValue, uint256 cap, uint8 flags)
        public
    {
        vm.assume(contentHash != bytes32(0));
        vm.assume(cap != type(uint256).max);
        flags = uint8(bound(flags, 0, 3));
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        t[1].maxValue = maxValue;
        t[1].flags = flags;
        f[0].cap = cap;
        (, bytes32 expected) = registry.computeVersionId(contentHash, t, p, f, _id("alice"));
        vm.prank(alice);
        assertEq(registry.register(contentHash, URI, t, p, f), expected);
    }
}
