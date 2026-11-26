// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AgentIdGated} from "./AgentIdGated.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";
import {ISkillRegistry} from "./interfaces/ISkillRegistry.sol";

/// @title  SkillRegistry
/// @notice Registers immutable versions of AI-agent skills. A version is:
///         - the hash of the skill's files (`contentHash`);
///         - the permission manifest the skill declares: the contracts and functions it calls, and the
///           approvals and transfers those calls may cause;
///         - the Agent ID of the author who registered it.
///         Countersign.sol records usage claims against these versions, and an off-chain verifier
///         checks each claim against the manifest stored here. This contract holds no funds and
///         accepts no native value.
///
/// @dev    versionId = keccak256(abi.encode(contentHash, manifestHash, registrantAgentId)).
///         Because the registrant is part of the id, registering someone else's content first gains
///         nothing. The canonical version is the one whose registrant matches the `publisher` named
///         inside the hashed content, and every pre-flight recomputes the id locally.
///
///         Owner permissions (disclosed): `setAttester`, plus the Ownable2Step functions
///         `transferOwnership`, `acceptOwnership` and `renounceOwnership`. The owner cannot edit,
///         delete or pause versions, manifests, endorsements or attestations, and cannot move any
///         user's assets.
///
///         Attester permissions (disclosed): `attest` and `revokeAttestation`. An attestation caches the
///         result of the open-source Red-Line Check. Anyone can re-run the check from the stored
///         checker commit and compare the report hash.
contract SkillRegistry is ISkillRegistry, AgentIdGated, Ownable2Step {
    // ── manifest vocabulary ────────────────────────────────────────────────────────────────────────

    /// @notice An author-owned contract. A countersign must cite at least one tx to an endorsed anchor.
    uint8 public constant ANCHOR = 1;
    /// @notice A contract that may pull the user's tokens under a declared approve flow (an escrow, say).
    uint8 public constant PULL = 2;

    uint8 public constant FLOW_APPROVE = 0;
    uint8 public constant FLOW_TRANSFER = 1;

    uint256 public constant MAX_TARGETS = 16;
    uint256 public constant MAX_PERMISSIONS = 64;
    uint256 public constant MAX_FLOWS = 32;
    uint256 public constant MAX_URI_BYTES = 512;
    uint256 public constant MAX_PAGE = 100;

    bytes4 private constant OWNER_SELECTOR = 0x8da5cb5b; // owner()
    uint256 private constant OWNER_PROBE_GAS = 50_000;

    /// @notice A contract the skill calls, as declared by the author.
    /// @param target   The contract address.
    /// @param impl     The EIP-1967 implementation it is expected to run, or zero if it is not a proxy.
    /// @param maxValue Maximum native value (wei) per call to this target.
    /// @param flags    ANCHOR and/or PULL.
    struct TargetIn {
        address target;
        address impl;
        uint96 maxValue;
        uint8 flags;
    }

    /// @notice A function selector the skill may call on targets[targetIndex].
    struct Permission {
        uint8 targetIndex;
        bytes4 selector;
    }

    /// @notice An approval (kind 0) or a transfer (kind 1) the skill's calls may cause, with its cap.
    ///         For an approval the counterparty is the spender; for a transfer it is the recipient.
    ///         token == address(0) means native BNB (transfers only).
    struct Flow {
        address token;
        address counterparty;
        uint8 kind;
        uint256 cap;
    }

    /// @notice A stored target, with its code fingerprint at registration and its anchor endorser.
    struct Target {
        address target;
        uint96 maxValue;
        address impl;
        uint8 flags;
        address endorser;
        bytes32 codehash;
    }

    struct Version {
        bytes32 contentHash;
        bytes32 manifestHash;
        uint256 registrantAgentId;
        address registrant;
        uint64 registeredBlock;
        uint64 registeredAt;
        string contentURI;
    }

    struct Attestation {
        address attester;
        uint64 blockNumber;
        uint32 rulesChecked;
        uint32 rulesPassed;
        bytes20 checkerCommit;
        bool revoked;
        bytes32 reportHash;
    }

    address public attester;
    uint256 public uniqueAgents;

    mapping(bytes32 versionId => Version) private _versions;
    mapping(bytes32 versionId => Target[]) private _targets;
    mapping(bytes32 versionId => Permission[]) private _permissions;
    mapping(bytes32 versionId => Flow[]) private _flows;
    mapping(bytes32 versionId => Attestation) private _attestations;
    mapping(bytes32 contentHash => bytes32[]) private _byContent;
    mapping(uint256 agentId => bool) private _seenAgent;
    bytes32[] private _versionLog;

    event VersionRegistered(
        bytes32 indexed versionId,
        bytes32 indexed contentHash,
        address indexed registrant,
        bytes32 manifestHash,
        string contentURI
    );
    event AnchorEndorsed(bytes32 indexed versionId, uint8 targetIndex, address endorser);
    event Attested(
        bytes32 indexed versionId,
        address attester,
        uint32 rulesChecked,
        uint32 rulesPassed,
        bytes20 checkerCommit,
        bytes32 reportHash
    );
    event AttestationRevoked(bytes32 indexed versionId, address attester);
    event AttesterChanged(address indexed previous, address indexed next);

    error ZeroContentHash();
    error BadContentURI(uint256 length);
    error EmptyManifest();
    error TooMany(uint256 got, uint256 max);
    error DuplicateTarget(address target);
    error BadFlags(uint8 flags);
    error BadIndex(uint256 index);
    error BadFlowKind(uint8 kind);
    error NativeApproval();
    error ZeroCounterparty();
    error UnlimitedCap(address token, address counterparty);
    error VersionExists(bytes32 versionId);
    error UnknownVersion(bytes32 versionId);
    error NotAnchor(uint256 targetIndex);
    error AlreadyEndorsed(uint256 targetIndex);
    error NotTargetOwner(address target);
    error NotAttester();
    error BadRuleMask(uint32 rulesChecked, uint32 rulesPassed);
    error NoAttestation(bytes32 versionId);

    constructor(IAgentID agentId, address initialOwner, address initialAttester)
        AgentIdGated(agentId)
        Ownable(initialOwner)
    {
        _setAttester(initialAttester);
    }

    // ── writes ────────────────────────────────────────────────────────────────────────────────────

    /// @notice Register a skill version. The caller must hold an Agent ID.
    ///         Anchors whose `owner()` is the caller are endorsed in the same call.
    function register(
        bytes32 contentHash,
        string calldata contentURI,
        TargetIn[] calldata targets,
        Permission[] calldata permissions,
        Flow[] calldata flows
    ) external returns (bytes32 versionId) {
        uint256 agentId = _agentIdOf(msg.sender);
        _checkShape(contentHash, bytes(contentURI).length, targets.length, permissions.length, flows.length);
        bytes32 manifestHash = keccak256(abi.encode(targets, permissions, flows));
        versionId = keccak256(abi.encode(contentHash, manifestHash, agentId));
        _storeVersion(versionId, contentHash, manifestHash, agentId, contentURI);
        _storeTargets(versionId, targets);
        _storePermissions(versionId, permissions, targets.length);
        _storeFlows(versionId, flows);
    }

    /// @notice Endorse an ANCHOR target as the owner of that contract (when the owner is not the
    ///         registrant). Proves that the author controls the contract that countersigns must touch.
    function endorseAnchor(bytes32 versionId, uint8 targetIndex) external {
        if (_versions[versionId].registeredBlock == 0) revert UnknownVersion(versionId);
        Target[] storage targets = _targets[versionId];
        if (targetIndex >= targets.length) revert BadIndex(targetIndex);
        Target storage t = targets[targetIndex];
        if (t.flags & ANCHOR == 0) revert NotAnchor(targetIndex);
        if (t.endorser != address(0)) revert AlreadyEndorsed(targetIndex);
        if (_probeOwner(t.target) != msg.sender) revert NotTargetOwner(t.target);
        t.endorser = msg.sender;
        emit AnchorEndorsed(versionId, targetIndex, msg.sender);
    }

    /// @notice Record the result of the open-source Red-Line Check for a version. Attester only.
    /// @param rulesChecked  Bitmask of the rules that were run.
    /// @param rulesPassed   Bitmask of the rules that passed; must be a subset of rulesChecked.
    /// @param checkerCommit The git commit of the checker that produced the report.
    /// @param reportHash    keccak256 of the canonical report JSON (published with the result).
    function attest(
        bytes32 versionId,
        uint32 rulesChecked,
        uint32 rulesPassed,
        bytes20 checkerCommit,
        bytes32 reportHash
    ) external {
        if (msg.sender != attester) revert NotAttester();
        if (_versions[versionId].registeredBlock == 0) revert UnknownVersion(versionId);
        if (rulesPassed & ~rulesChecked != 0) revert BadRuleMask(rulesChecked, rulesPassed);
        _attestations[versionId] = Attestation({
            attester: msg.sender,
            blockNumber: uint64(block.number),
            rulesChecked: rulesChecked,
            rulesPassed: rulesPassed,
            checkerCommit: checkerCommit,
            revoked: false,
            reportHash: reportHash
        });
        emit Attested(versionId, msg.sender, rulesChecked, rulesPassed, checkerCommit, reportHash);
    }

    /// @notice Withdraw an attestation, e.g. if the checker had a bug. Attester only.
    function revokeAttestation(bytes32 versionId) external {
        if (msg.sender != attester) revert NotAttester();
        Attestation storage a = _attestations[versionId];
        if (a.blockNumber == 0) revert NoAttestation(versionId);
        a.revoked = true;
        emit AttestationRevoked(versionId, msg.sender);
    }

    /// @notice Rotate the attester key. Owner only; this is the owner's only power over the registry.
    function setAttester(address next) external onlyOwner {
        _setAttester(next);
    }

    // ── views ─────────────────────────────────────────────────────────────────────────────────────

    function exists(bytes32 versionId) external view returns (bool) {
        return _versions[versionId].registeredBlock != 0;
    }

    /// @inheritdoc ISkillRegistry
    function authorOf(bytes32 versionId)
        external
        view
        returns (address registrant, uint256 registrantAgentId, uint64 registeredBlock)
    {
        Version storage v = _versions[versionId];
        return (v.registrant, v.registrantAgentId, v.registeredBlock);
    }

    /// @return The version (all zero fields if it does not exist).
    function getVersion(bytes32 versionId) external view returns (Version memory) {
        return _versions[versionId];
    }

    function getManifest(bytes32 versionId)
        external
        view
        returns (Target[] memory targets, Permission[] memory permissions, Flow[] memory flows)
    {
        return (_targets[versionId], _permissions[versionId], _flows[versionId]);
    }

    /// @return The attestation (blockNumber == 0 if there is none).
    function getAttestation(bytes32 versionId) external view returns (Attestation memory) {
        return _attestations[versionId];
    }

    function versionCount() external view returns (uint256) {
        return _versionLog.length;
    }

    /// @notice Registered version ids in registration order. Returns at most MAX_PAGE entries.
    function versionsPage(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        return _page(_versionLog, offset, limit);
    }

    /// @notice Every version registered for a content hash: the canonical one plus any squatters.
    function versionsByContent(bytes32 contentHash, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory page, uint256 total)
    {
        bytes32[] storage list = _byContent[contentHash];
        return (_page(list, offset, limit), list.length);
    }

    /// @notice The exact hashes register() would compute. Lets clients cross-check their ABI encoding.
    function computeVersionId(
        bytes32 contentHash,
        TargetIn[] calldata targets,
        Permission[] calldata permissions,
        Flow[] calldata flows,
        uint256 registrantAgentId
    ) external pure returns (bytes32 manifestHash, bytes32 versionId) {
        manifestHash = keccak256(abi.encode(targets, permissions, flows));
        versionId = keccak256(abi.encode(contentHash, manifestHash, registrantAgentId));
    }

    // ── internals ─────────────────────────────────────────────────────────────────────────────────

    function _checkShape(
        bytes32 contentHash,
        uint256 uriLength,
        uint256 targetCount,
        uint256 permissionCount,
        uint256 flowCount
    ) private pure {
        if (contentHash == bytes32(0)) revert ZeroContentHash();
        if (uriLength == 0 || uriLength > MAX_URI_BYTES) revert BadContentURI(uriLength);
        if (targetCount == 0) revert EmptyManifest();
        if (targetCount > MAX_TARGETS) revert TooMany(targetCount, MAX_TARGETS);
        if (permissionCount > MAX_PERMISSIONS) revert TooMany(permissionCount, MAX_PERMISSIONS);
        if (flowCount > MAX_FLOWS) revert TooMany(flowCount, MAX_FLOWS);
    }

    function _storeVersion(
        bytes32 versionId,
        bytes32 contentHash,
        bytes32 manifestHash,
        uint256 agentId,
        string calldata contentURI
    ) private {
        Version storage v = _versions[versionId];
        if (v.registeredBlock != 0) revert VersionExists(versionId);
        v.contentHash = contentHash;
        v.manifestHash = manifestHash;
        v.registrantAgentId = agentId;
        v.registrant = msg.sender;
        v.registeredBlock = uint64(block.number);
        v.registeredAt = uint64(block.timestamp);
        v.contentURI = contentURI;
        _byContent[contentHash].push(versionId);
        _versionLog.push(versionId);
        if (!_seenAgent[agentId]) {
            _seenAgent[agentId] = true;
            ++uniqueAgents;
        }
        emit VersionRegistered(versionId, contentHash, msg.sender, manifestHash, contentURI);
    }

    function _storeTargets(bytes32 versionId, TargetIn[] calldata targets) private {
        Target[] storage stored = _targets[versionId];
        for (uint256 i; i < targets.length; ++i) {
            TargetIn calldata t = targets[i];
            if (t.target.code.length == 0) revert NotAContract(t.target);
            if (t.impl != address(0) && t.impl.code.length == 0) revert NotAContract(t.impl);
            if ((t.flags & ~(ANCHOR | PULL)) != 0) revert BadFlags(t.flags);
            for (uint256 j; j < i; ++j) {
                if (targets[j].target == t.target) revert DuplicateTarget(t.target);
            }
            address endorser;
            if ((t.flags & ANCHOR) != 0 && _probeOwner(t.target) == msg.sender) endorser = msg.sender;
            stored.push(
                Target({
                    target: t.target,
                    maxValue: t.maxValue,
                    impl: t.impl,
                    flags: t.flags,
                    endorser: endorser,
                    codehash: t.target.codehash
                })
            );
            // casting to 'uint8' is safe because i < targets.length <= MAX_TARGETS (16)
            // forge-lint: disable-next-line(unsafe-typecast)
            if (endorser != address(0)) emit AnchorEndorsed(versionId, uint8(i), endorser);
        }
    }

    function _storePermissions(bytes32 versionId, Permission[] calldata permissions, uint256 targetCount)
        private
    {
        Permission[] storage stored = _permissions[versionId];
        for (uint256 i; i < permissions.length; ++i) {
            if (permissions[i].targetIndex >= targetCount) revert BadIndex(permissions[i].targetIndex);
            stored.push(permissions[i]);
        }
    }

    function _storeFlows(bytes32 versionId, Flow[] calldata flows) private {
        Flow[] storage stored = _flows[versionId];
        for (uint256 i; i < flows.length; ++i) {
            Flow calldata f = flows[i];
            if (f.kind > FLOW_TRANSFER) revert BadFlowKind(f.kind);
            if (f.kind == FLOW_APPROVE && f.token == address(0)) revert NativeApproval();
            if (f.counterparty == address(0)) revert ZeroCounterparty();
            // Unlimited caps are refused outright: red line #3 is built into the protocol.
            if (f.cap == type(uint256).max) revert UnlimitedCap(f.token, f.counterparty);
            stored.push(f);
        }
    }

    function _setAttester(address next) private {
        emit AttesterChanged(attester, next);
        attester = next;
    }

    /// @dev Reads `owner()` without trusting the target: bounded gas, at most 32 bytes copied (a large
    ///      return payload can't be used to burn gas), and a dirty word is treated as "no owner".
    function _probeOwner(address target) private view returns (address result) {
        bool ok;
        uint256 size;
        uint256 word;
        bytes4 selector = OWNER_SELECTOR;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, selector)
            ok := staticcall(OWNER_PROBE_GAS, target, ptr, 4, ptr, 32)
            size := returndatasize()
            word := mload(ptr)
        }
        if (!ok || size < 32 || word >> 160 != 0) return address(0);
        // casting to 'uint160' is safe because the line above returned unless the upper 96 bits are zero
        // forge-lint: disable-next-line(unsafe-typecast)
        result = address(uint160(word));
    }

    function _page(bytes32[] storage list, uint256 offset, uint256 limit)
        private
        view
        returns (bytes32[] memory page)
    {
        uint256 length = list.length;
        if (offset >= length) return new bytes32[](0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 end = offset + limit;
        if (end > length) end = length;
        page = new bytes32[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = list[offset + i];
        }
    }
}
