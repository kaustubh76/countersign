// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISkillRegistry} from "./interfaces/ISkillRegistry.sol";

/// @title  GuardedExecutor
/// @notice An opt-in, on-chain guard for skill calls. The user's wallet calls
///         `execute(versionId, target, data)` instead of calling `target` directly. The call goes through only
///         if the registered manifest of that skill version declares the target and the function, the call
///         carries no native value, and the target's code is unchanged since registration. Anything else
///         reverts on-chain, so a skill cannot take a guarded call outside what it declared, whatever it
///         tells the agent.
///
///         The target receives `data` with the caller's address appended (ERC-2771). An author's contract
///         opts in by trusting this executor as its forwarder (`isTrustedForwarder`) and reading the caller
///         with `_msgSender()`. Opting in is itself a trust signal: COUNTERSIGN shows it on the badge.
///
/// @dev    No owner, no admin, no storage, no upgrade path. It holds no funds: `execute` is not payable and
///         there is no receive or fallback. It refuses token-movement selectors and batch-call selectors, so
///         a shared forwarder can never spend an allowance or move a token, even one approved to it by
///         mistake. A proxy target's implementation can change without changing its code hash; the
///         off-chain verifier records that as a drift incident (I1).
contract GuardedExecutor {
    ISkillRegistry public immutable REGISTRY;

    event Guarded(bytes32 indexed versionId, address indexed target, bytes4 selector);

    error NotAContract(address account);
    error NoSelector();
    error RefusedSelector(bytes4 selector);
    error OutsideManifest(uint8 code);

    constructor(ISkillRegistry registry) {
        if (address(registry).code.length == 0) revert NotAContract(address(registry));
        REGISTRY = registry;
    }

    /// @notice Call `target` with `data` (and the caller appended), if the version's manifest allows it.
    /// @return result The target's return data. A revert in the target is bubbled up unchanged.
    function execute(bytes32 versionId, address target, bytes calldata data) external returns (bytes memory result) {
        if (data.length < 4) revert NoSelector();
        bytes4 selector = bytes4(data[:4]);
        if (isRefusedSelector(selector)) revert RefusedSelector(selector);
        uint8 code = REGISTRY.checkCall(versionId, target, selector, 0);
        if (code != 0) revert OutsideManifest(code);
        bool ok;
        (ok, result) = target.call(abi.encodePacked(data, msg.sender));
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
        emit Guarded(versionId, target, selector);
    }

    /// @notice Selectors this executor never forwards: token transfers and approvals, and batch calls (a
    ///         batch could replay an inner call with a forged ERC-2771 suffix).
    function isRefusedSelector(bytes4 s) public pure returns (bool) {
        return s == 0xa9059cbb // transfer(address,uint256)
            || s == 0x23b872dd // transferFrom(address,address,uint256)
            || s == 0x095ea7b3 // approve(address,uint256)
            || s == 0x39509351 // increaseAllowance(address,uint256)
            || s == 0xd505accf // permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
            || s == 0xa22cb465 // setApprovalForAll(address,bool)
            || s == 0x42842e0e // safeTransferFrom(address,address,uint256)
            || s == 0xb88d4fde // safeTransferFrom(address,address,uint256,bytes)
            || s == 0xf242432a // safeTransferFrom(address,address,uint256,uint256,bytes)
            || s == 0x2eb2c2d6 // safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
            || s == 0xac9650d8 // multicall(bytes[])
            || s == 0x5ae401dc // multicall(uint256,bytes[])
            || s == 0x1f0464d1 // multicall(bytes32,bytes[])
            || s == 0x252dba42 // aggregate((address,bytes)[])
            || s == 0x82ad56cb // aggregate3((address,bool,bytes)[])
            || s == 0x174dea71 // aggregate3Value((address,bool,uint256,bytes)[])
            || s == 0xbce38bd7; // tryAggregate(bool,(address,bytes)[])
    }
}
