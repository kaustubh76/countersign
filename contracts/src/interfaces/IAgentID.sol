// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The two functions COUNTERSIGN uses from SPACE ID's Agent ID registry ("HandleRegistry",
///         BSC mainnet 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F, Sourcify-verified).
/// @dev    In that contract tokenId == uint256(keccak256(bytes(handle))). There is at most one handle
///         per address, and tokens are soulbound (transfer and approve revert, and there is no burn).
///         So an address that holds a handle today held the same Agent ID for its whole lifetime.
interface IAgentID {
    /// @return The handle (e.g. "alice" for alice.ai) owned by `owner`, or "" if it holds none.
    function handleOf(address owner) external view returns (string memory);

    /// @dev Reverts for a tokenId that was never minted.
    function ownerOf(uint256 tokenId) external view returns (address);
}
