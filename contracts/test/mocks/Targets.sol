// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice An author-owned dApp contract (anchor candidate).
contract OwnedTarget {
    address public owner;
    uint256 public pings;

    constructor(address owner_) {
        owner = owner_;
    }

    function ping() external {
        ++pings;
    }
}

/// @notice A shared contract with no owner() (a router or token from the skill's point of view).
contract PlainTarget {
    uint256 public pings;

    function ping() external {
        ++pings;
    }
}

/// @notice owner() returns a huge payload. The registry must not copy it or run out of gas.
contract ReturnBombTarget {
    fallback() external {
        assembly {
            return(0, 1000000)
        }
    }
}

/// @notice owner() returns a word with non-zero upper bits. It must be treated as "no owner".
contract DirtyOwnerTarget {
    address public immutable realOwner;

    constructor(address owner_) {
        realOwner = owner_;
    }

    fallback() external {
        uint256 word = (uint256(1) << 200) | uint256(uint160(realOwner));
        assembly {
            mstore(0, word)
            return(0, 32)
        }
    }
}
