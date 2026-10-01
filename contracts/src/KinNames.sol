// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/// @title KinNames
/// @notice Onchain @handle registry. Handles are 3-20 chars of [a-z0-9_], one per address, permanent.
contract KinNames is ERC2771Context {
    /// @notice handle => owner
    mapping(string => address) public resolve;
    /// @notice owner => handle ("" if none)
    mapping(address => string) public nameOf;

    event NameClaimed(address indexed owner, string handle);

    error InvalidName();
    error NameTaken();
    error AlreadyNamed();

    constructor(address forwarder) ERC2771Context(forwarder) {}

    /// @notice Claim `handle` for the caller. Irreversible.
    function claim(string calldata handle) external {
        bytes calldata b = bytes(handle);
        if (b.length < 3 || b.length > 20) revert InvalidName();
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_")) revert InvalidName();
        }
        address sender = _msgSender();
        if (resolve[handle] != address(0)) revert NameTaken();
        if (bytes(nameOf[sender]).length != 0) revert AlreadyNamed();
        resolve[handle] = sender;
        nameOf[sender] = handle;
        emit NameClaimed(sender, handle);
    }
}
