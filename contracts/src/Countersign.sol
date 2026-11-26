// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AgentIdGated} from "./AgentIdGated.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";
import {ISkillRegistry} from "./interfaces/ISkillRegistry.sol";

/// @title  Countersign
/// @notice Agent ID holders record that their own wallet used a skill version (`countersign`, citing
///         that session's tx hashes) or that it misbehaved (`report`, citing evidence tx hashes).
///
///         This contract only enforces what can be checked on-chain:
///         - the caller holds an Agent ID (resolved on-chain, never passed in);
///         - one countersign and one report per Agent ID per version;
///         - the registrant cannot countersign their own version;
///         - each Agent ID can cite a given tx hash only once, across all versions.
///
///         Whether a record *counts* is decided by the open-source off-chain verifier. It checks every
///         cited tx: sent by this wallet, after registration, within 48 h, to the version's declared
///         contracts, with every approval and transfer inside the manifest. Raw counts here are claims,
///         not the signal.
///
/// @dev    No owner, no admin, no upgrade path, no funds, no native value accepted.
contract Countersign is AgentIdGated {
    uint8 public constant KIND_COUNTERSIGN = 1;
    uint8 public constant KIND_REPORT = 2;
    uint256 public constant MAX_TX_HASHES = 8;
    uint256 public constant MAX_PAGE = 100;

    struct Record {
        bytes32 versionId;
        uint256 agentId;
        address signer;
        uint64 blockNumber;
        uint8 kind;
        bytes32[] txHashes;
    }

    ISkillRegistry public immutable REGISTRY;
    uint256 public uniqueAgents;

    Record[] private _records;
    mapping(bytes32 versionId => uint256[]) private _countersignIds;
    mapping(bytes32 versionId => uint256[]) private _reportIds;
    mapping(bytes32 versionId => mapping(uint256 agentId => bool)) private _countersigned;
    mapping(bytes32 versionId => mapping(uint256 agentId => bool)) private _reported;
    mapping(bytes32 agentTxKey => bool) private _consumed;
    mapping(uint256 agentId => bool) private _seenAgent;

    event Countersigned(bytes32 indexed versionId, uint256 indexed recordId);
    event Reported(bytes32 indexed versionId, uint256 indexed recordId);

    error UnknownVersion(bytes32 versionId);
    error SelfCountersign();
    error AlreadyCountersigned();
    error AlreadyReported();
    error BadTxCount(uint256 count);
    error ZeroTxHash();
    error DuplicateTxHash(bytes32 txHash);
    error TxAlreadyUsed(bytes32 txHash);

    constructor(IAgentID agentId, ISkillRegistry registry) AgentIdGated(agentId) {
        if (address(registry).code.length == 0) revert NotAContract(address(registry));
        REGISTRY = registry;
    }

    // ── writes ────────────────────────────────────────────────────────────────────────────────────

    /// @notice Countersign a skill version after a clean session, citing that session's txs (1–8).
    function countersign(bytes32 versionId, bytes32[] calldata sessionTxs) external returns (uint256 recordId) {
        (address registrant, uint256 registrantAgentId,) = _author(versionId);
        uint256 agentId = _agentIdOf(msg.sender);
        if (msg.sender == registrant || agentId == registrantAgentId) revert SelfCountersign();
        if (_countersigned[versionId][agentId]) revert AlreadyCountersigned();
        _checkTxHashes(sessionTxs);
        for (uint256 i; i < sessionTxs.length; ++i) {
            bytes32 key = keccak256(abi.encode(agentId, sessionTxs[i]));
            if (_consumed[key]) revert TxAlreadyUsed(sessionTxs[i]);
            _consumed[key] = true;
        }
        _countersigned[versionId][agentId] = true;
        recordId = _append(versionId, agentId, KIND_COUNTERSIGN, sessionTxs);
        _countersignIds[versionId].push(recordId);
        emit Countersigned(versionId, recordId);
    }

    /// @notice Report a skill version, citing evidence txs (1–8). The verifier decides whether the report
    ///         is a verified incident (contract drift, an author-sent pull, a reproducible static finding)
    ///         or an unverified claim.
    function report(bytes32 versionId, bytes32[] calldata evidenceTxs) external returns (uint256 recordId) {
        _author(versionId);
        uint256 agentId = _agentIdOf(msg.sender);
        if (_reported[versionId][agentId]) revert AlreadyReported();
        _checkTxHashes(evidenceTxs);
        _reported[versionId][agentId] = true;
        recordId = _append(versionId, agentId, KIND_REPORT, evidenceTxs);
        _reportIds[versionId].push(recordId);
        emit Reported(versionId, recordId);
    }

    // ── views ─────────────────────────────────────────────────────────────────────────────────────

    function recordCount() external view returns (uint256) {
        return _records.length;
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        return _records[recordId];
    }

    /// @notice All records in submission order. Returns at most MAX_PAGE entries.
    function recordsPage(uint256 offset, uint256 limit) external view returns (Record[] memory page) {
        uint256 length = _records.length;
        if (offset >= length) return new Record[](0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 end = offset + limit;
        if (end > length) end = length;
        page = new Record[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = _records[offset + i];
        }
    }

    function countersignCount(bytes32 versionId) external view returns (uint256) {
        return _countersignIds[versionId].length;
    }

    function reportCount(bytes32 versionId) external view returns (uint256) {
        return _reportIds[versionId].length;
    }

    function countersignsOf(bytes32 versionId, uint256 offset, uint256 limit)
        external
        view
        returns (Record[] memory page, uint256 total)
    {
        uint256[] storage ids = _countersignIds[versionId];
        return (_pageByIds(ids, offset, limit), ids.length);
    }

    function reportsOf(bytes32 versionId, uint256 offset, uint256 limit)
        external
        view
        returns (Record[] memory page, uint256 total)
    {
        uint256[] storage ids = _reportIds[versionId];
        return (_pageByIds(ids, offset, limit), ids.length);
    }

    // ── internals ─────────────────────────────────────────────────────────────────────────────────

    function _author(bytes32 versionId)
        private
        view
        returns (address registrant, uint256 registrantAgentId, uint64 registeredBlock)
    {
        (registrant, registrantAgentId, registeredBlock) = REGISTRY.authorOf(versionId);
        if (registeredBlock == 0) revert UnknownVersion(versionId);
    }

    function _checkTxHashes(bytes32[] calldata txHashes) private pure {
        uint256 n = txHashes.length;
        if (n == 0 || n > MAX_TX_HASHES) revert BadTxCount(n);
        for (uint256 i; i < n; ++i) {
            if (txHashes[i] == bytes32(0)) revert ZeroTxHash();
            for (uint256 j; j < i; ++j) {
                if (txHashes[j] == txHashes[i]) revert DuplicateTxHash(txHashes[i]);
            }
        }
    }

    function _append(bytes32 versionId, uint256 agentId, uint8 kind, bytes32[] calldata txHashes)
        private
        returns (uint256 recordId)
    {
        recordId = _records.length;
        Record storage r = _records.push();
        r.versionId = versionId;
        r.agentId = agentId;
        r.signer = msg.sender;
        r.blockNumber = uint64(block.number);
        r.kind = kind;
        r.txHashes = txHashes;
        if (!_seenAgent[agentId]) {
            _seenAgent[agentId] = true;
            ++uniqueAgents;
        }
    }

    function _pageByIds(uint256[] storage ids, uint256 offset, uint256 limit)
        private
        view
        returns (Record[] memory page)
    {
        uint256 length = ids.length;
        if (offset >= length) return new Record[](0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 end = offset + limit;
        if (end > length) end = length;
        page = new Record[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = _records[ids[offset + i]];
        }
    }
}
