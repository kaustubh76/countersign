// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Base} from "./Base.t.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {GuardedExecutor} from "../src/GuardedExecutor.sol";
import {ISkillRegistry} from "../src/interfaces/ISkillRegistry.sol";
import {GuardedTarget, OwnedTarget, PlainTarget} from "./mocks/Targets.sol";

/// @notice A declared target that calls back into the executor. It can only ever act as itself.
contract ReentrantTarget {
    GuardedExecutor internal immutable EXECUTOR;

    constructor(GuardedExecutor executor) {
        EXECUTOR = executor;
    }

    function poke(bytes32 versionId, address app) external {
        EXECUTOR.execute(versionId, app, abi.encodeCall(GuardedTarget.ping, ()));
    }
}

contract GuardedExecutorTest is Base {
    GuardedExecutor internal executor;
    GuardedTarget internal app;
    bytes32 internal versionId;

    function setUp() public override {
        super.setUp();
        executor = new GuardedExecutor(ISkillRegistry(address(registry)));
        app = new GuardedTarget(alice, address(executor));
        SkillRegistry.TargetIn[] memory t = new SkillRegistry.TargetIn[](2);
        t[0] = SkillRegistry.TargetIn({target: address(app), impl: address(0), maxValue: 0, flags: 1});
        t[1] = SkillRegistry.TargetIn({target: address(shared), impl: address(0), maxValue: 1 ether, flags: 0});
        SkillRegistry.Permission[] memory p = new SkillRegistry.Permission[](4);
        p[0] = SkillRegistry.Permission({targetIndex: 0, selector: GuardedTarget.ping.selector});
        p[1] = SkillRegistry.Permission({targetIndex: 0, selector: GuardedTarget.boom.selector});
        p[2] = SkillRegistry.Permission({targetIndex: 1, selector: PlainTarget.ping.selector});
        // declared, but the executor still refuses it: a shared forwarder never moves tokens
        p[3] = SkillRegistry.Permission({targetIndex: 0, selector: bytes4(0xa9059cbb)});
        vm.prank(alice);
        versionId = registry.register(keccak256("guarded-skill"), URI, t, p, new SkillRegistry.Flow[](0));
    }

    function _ping() internal pure returns (bytes memory) {
        return abi.encodeCall(GuardedTarget.ping, ());
    }

    function test_ForwardsADeclaredCall_WithTheRealCallerAppended() public {
        vm.expectEmit(true, true, true, true, address(executor));
        emit GuardedExecutor.Guarded(versionId, address(app), GuardedTarget.ping.selector);
        vm.prank(bob);
        executor.execute(versionId, address(app), _ping());
        assertEq(app.pings(), 1);
        assertEq(app.lastSender(), bob, "the target sees the user, not the executor");
        assertTrue(app.isTrustedForwarder(address(executor)), "opting in is visible on-chain");
    }

    function test_RevertsOnChain_OutsideTheManifest() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.OutsideManifest.selector, uint8(3)));
        executor.execute(versionId, address(app), abi.encodeCall(GuardedTarget.sweep, ()));

        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.OutsideManifest.selector, uint8(2)));
        executor.execute(versionId, address(anchorTarget), abi.encodeCall(OwnedTarget.ping, ()));

        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.OutsideManifest.selector, uint8(1)));
        executor.execute(keccak256("not-registered"), address(app), _ping());
        vm.stopPrank();

        // the author swaps the contract's code after registration: guarded calls stop
        vm.etch(address(app), address(shared).code);
        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.OutsideManifest.selector, uint8(5)));
        vm.prank(bob);
        executor.execute(versionId, address(app), _ping());
    }

    function test_RefusesTokenAndBatchSelectors_EvenWhenDeclared() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.RefusedSelector.selector, bytes4(0xa9059cbb)));
        vm.prank(bob);
        executor.execute(versionId, address(app), abi.encodeWithSelector(bytes4(0xa9059cbb), bob, 1));

        bytes4[17] memory refused = [
            bytes4(0xa9059cbb), 0x23b872dd, 0x095ea7b3, 0x39509351, 0xd505accf, 0xa22cb465, 0x42842e0e, 0xb88d4fde,
            0xf242432a, 0x2eb2c2d6, 0xac9650d8, 0x5ae401dc, 0x1f0464d1, 0x252dba42, 0x82ad56cb, 0x174dea71, 0xbce38bd7
        ];
        for (uint256 i; i < refused.length; ++i) {
            assertTrue(executor.isRefusedSelector(refused[i]));
        }
        assertFalse(executor.isRefusedSelector(GuardedTarget.ping.selector));
    }

    function test_RefusesShortCalldata_NativeValue_AndHoldsNothing() public {
        vm.expectRevert(GuardedExecutor.NoSelector.selector);
        executor.execute(versionId, address(app), hex"0102");

        vm.deal(bob, 1 ether);
        vm.startPrank(bob);
        (bool ok,) = address(executor).call{value: 1}(abi.encodeCall(GuardedExecutor.execute, (versionId, address(app), _ping())));
        assertFalse(ok, "execute is not payable");
        (ok,) = address(executor).call{value: 1}("");
        assertFalse(ok, "no receive or fallback");
        vm.stopPrank();
        assertEq(address(executor).balance, 0);
    }

    function test_BubblesTheTargetsRevert() public {
        vm.expectRevert(bytes("boom"));
        vm.prank(bob);
        executor.execute(versionId, address(app), abi.encodeCall(GuardedTarget.boom, ()));
    }

    function test_AReentrantTargetCanOnlyActAsItself() public {
        ReentrantTarget r = new ReentrantTarget(executor);
        SkillRegistry.TargetIn[] memory t = new SkillRegistry.TargetIn[](2);
        t[0] = SkillRegistry.TargetIn({target: address(r), impl: address(0), maxValue: 0, flags: 0});
        t[1] = SkillRegistry.TargetIn({target: address(app), impl: address(0), maxValue: 0, flags: 0});
        SkillRegistry.Permission[] memory p = new SkillRegistry.Permission[](2);
        p[0] = SkillRegistry.Permission({targetIndex: 0, selector: ReentrantTarget.poke.selector});
        p[1] = SkillRegistry.Permission({targetIndex: 1, selector: GuardedTarget.ping.selector});
        vm.prank(bob);
        bytes32 v2 = registry.register(keccak256("reentrant"), URI, t, p, new SkillRegistry.Flow[](0));

        vm.prank(carol);
        executor.execute(v2, address(r), abi.encodeCall(ReentrantTarget.poke, (v2, address(app))));
        assertEq(app.lastSender(), address(r), "the inner call is forwarded as the target, never as carol");
    }

    function test_Constructor_RejectsNonContractRegistry() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedExecutor.NotAContract.selector, address(0x1234)));
        new GuardedExecutor(ISkillRegistry(address(0x1234)));
    }

    function testFuzz_NeverForwardsAnUndeclaredSelector(bytes4 selector, bytes calldata tail) public {
        vm.assume(selector != GuardedTarget.ping.selector && selector != GuardedTarget.boom.selector);
        vm.expectRevert();
        vm.prank(bob);
        executor.execute(versionId, address(app), abi.encodePacked(selector, tail));
        assertEq(app.pings(), 0);
    }
}
