// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal EIP-3009 surface used by Kin (AUSD `bytes signature` overload).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}
