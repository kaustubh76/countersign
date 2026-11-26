// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The view that Countersign reads from SkillRegistry.
interface ISkillRegistry {
    /// @return registrant The address that registered the version (zero if the version does not exist).
    /// @return registrantAgentId The registrant's Agent ID tokenId.
    /// @return registeredBlock The block the version was registered in (zero if it does not exist).
    function authorOf(bytes32 versionId)
        external
        view
        returns (address registrant, uint256 registrantAgentId, uint64 registeredBlock);
}
