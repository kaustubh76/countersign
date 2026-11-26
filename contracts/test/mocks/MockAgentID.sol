// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Test double that mirrors the on-chain rules of SPACE ID's HandleRegistry (BSC 0x60B9…022F):
///         tokenId = uint256(keccak256(bytes(handle))), one handle per address, soulbound (approve,
///         setApprovalForAll and every transfer of an existing token revert), no burn.
///         There is no Agent ID on BSC testnet, so local runs use this instead.
contract MockAgentID is ERC721 {
    mapping(address owner => string) public handleOf;

    error AddressHasHandle();
    error HandleTaken();
    error Soulbound();

    constructor() ERC721("SPACE ID Agent ID", "AI") {}

    function mint(address to, string calldata handle) external returns (uint256 tokenId) {
        if (bytes(handleOf[to]).length != 0) revert AddressHasHandle();
        tokenId = uint256(keccak256(bytes(handle)));
        if (_ownerOf(tokenId) != address(0)) revert HandleTaken();
        handleOf[to] = handle;
        _mint(to, tokenId);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}

/// @notice A broken registry whose handleOf and ownerOf disagree. Exercises the defensive ownerOf check.
contract LyingAgentID {
    function handleOf(address) external pure returns (string memory) {
        return "imposter";
    }

    function ownerOf(uint256) external pure returns (address) {
        return address(0xBEEF);
    }
}
