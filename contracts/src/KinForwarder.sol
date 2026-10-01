// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @title KinForwarder
/// @notice ERC-2771 trusted forwarder for all Kin contracts. EIP-712 domain ("Kin", "1").
contract KinForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("Kin") {}
}
