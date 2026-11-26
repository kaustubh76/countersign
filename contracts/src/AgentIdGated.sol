// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAgentID} from "./interfaces/IAgentID.sol";

/// @notice Resolves the caller's Agent ID on-chain. Callers never pass a handle or tokenId, so nobody can
///         act under someone else's Agent ID, and no names ever appear in COUNTERSIGN calldata or events.
abstract contract AgentIdGated {
    IAgentID public immutable AGENT_ID;

    error NotAgentIdHolder(address account);
    error NotAContract(address account);

    constructor(IAgentID agentId) {
        if (address(agentId).code.length == 0) revert NotAContract(address(agentId));
        AGENT_ID = agentId;
    }

    /// @return agentId The Agent ID tokenId held by `account`. Reverts if it holds none.
    function _agentIdOf(address account) internal view returns (uint256 agentId) {
        bytes memory handle = bytes(AGENT_ID.handleOf(account));
        if (handle.length == 0) revert NotAgentIdHolder(account);
        agentId = uint256(keccak256(handle));
        // Defensive: in the real registry this always holds when handleOf is non-empty.
        if (AGENT_ID.ownerOf(agentId) != account) revert NotAgentIdHolder(account);
    }
}
