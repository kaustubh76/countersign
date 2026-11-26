// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {Countersign} from "../src/Countersign.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {ISkillRegistry} from "../src/interfaces/ISkillRegistry.sol";
import {MockAgentID} from "./mocks/MockAgentID.sol";
import {OwnedTarget, PlainTarget} from "./mocks/Targets.sol";

abstract contract Base is Test {
    string internal constant URI = "https://github.com/example/skill/tree/0123abc/skills/example";
    bytes32 internal constant CONTENT = keccak256("example-skill-v1");

    MockAgentID internal agentIdNft;
    SkillRegistry internal registry;
    Countersign internal countersign;
    OwnedTarget internal anchorTarget; // owned by alice, the author
    PlainTarget internal shared; // no owner(), like a router or a token

    address internal owner = makeAddr("owner");
    address internal attester = makeAddr("attester");
    address internal alice = makeAddr("alice"); // author, holds alice.ai
    address internal bob = makeAddr("bob"); // user, holds bob.ai
    address internal carol = makeAddr("carol"); // user, holds carol.ai
    address internal dave = makeAddr("dave"); // user, holds dave.ai
    address internal mallory = makeAddr("mallory"); // no Agent ID

    function setUp() public virtual {
        agentIdNft = new MockAgentID();
        agentIdNft.mint(alice, "alice");
        agentIdNft.mint(bob, "bob");
        agentIdNft.mint(carol, "carol");
        agentIdNft.mint(dave, "dave");
        registry = new SkillRegistry(IAgentID(address(agentIdNft)), owner, attester);
        countersign = new Countersign(IAgentID(address(agentIdNft)), ISkillRegistry(address(registry)));
        anchorTarget = new OwnedTarget(alice);
        shared = new PlainTarget();
    }

    function _id(string memory handle) internal pure returns (uint256) {
        return uint256(keccak256(bytes(handle)));
    }

    /// @dev targets: [anchorTarget (ANCHOR), shared (maxValue 1 BNB)];
    ///      permissions: ping() on each; flows: approve shared-token → anchorTarget up to 100e18.
    function _manifest()
        internal
        view
        returns (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f)
    {
        t = new SkillRegistry.TargetIn[](2);
        t[0] = SkillRegistry.TargetIn({target: address(anchorTarget), impl: address(0), maxValue: 0, flags: 1});
        t[1] = SkillRegistry.TargetIn({target: address(shared), impl: address(0), maxValue: 1 ether, flags: 0});
        p = new SkillRegistry.Permission[](2);
        p[0] = SkillRegistry.Permission({targetIndex: 0, selector: OwnedTarget.ping.selector});
        p[1] = SkillRegistry.Permission({targetIndex: 1, selector: PlainTarget.ping.selector});
        f = new SkillRegistry.Flow[](1);
        f[0] = SkillRegistry.Flow({token: address(shared), counterparty: address(anchorTarget), kind: 0, cap: 100e18});
    }

    function _register(address who, bytes32 contentHash) internal returns (bytes32 versionId) {
        (SkillRegistry.TargetIn[] memory t, SkillRegistry.Permission[] memory p, SkillRegistry.Flow[] memory f) =
            _manifest();
        vm.prank(who);
        versionId = registry.register(contentHash, URI, t, p, f);
    }

    function _txs(uint256 n, uint256 salt) internal pure returns (bytes32[] memory txs) {
        txs = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            txs[i] = keccak256(abi.encode(salt, i));
        }
    }
}
