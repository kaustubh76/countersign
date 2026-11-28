// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The views that Countersign and GuardedExecutor read from SkillRegistry.
interface ISkillRegistry {
    /// @return registrant The address that registered the version (zero if the version does not exist).
    /// @return registrantAgentId The registrant's Agent ID tokenId.
    /// @return registeredBlock The block the version was registered in (zero if it does not exist).
    function authorOf(bytes32 versionId)
        external
        view
        returns (address registrant, uint256 registrantAgentId, uint64 registeredBlock);

    /// @notice Is this call inside the version's registered manifest? 0 = yes; otherwise the first reason it
    ///         is not: 1 unknown version, 2 undeclared target, 3 undeclared function, 4 value over the
    ///         target's cap, 5 the target's code changed since registration.
    function checkCall(bytes32 versionId, address target, bytes4 selector, uint256 value)
        external
        view
        returns (uint8);
}
