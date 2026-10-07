// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title KinBatchExecutor
/// @notice EIP-7702 delegate for a user's own account (EOA). Once the user's EOA delegates here, Kin's relayer can
///         submit a batch of calls (e.g. an ERC-20 approve + a deposit) that run with the user's EOA as msg.sender,
///         while the relayer pays gas. Only a batch the EOA's own key signed can run: the signature is checked
///         against address(this), which under 7702 is the user's address. No owner, no admin, no stored funds.
/// @dev Built for partner flows that require on-chain steps from the user's own address (Agora Via / Relay).
///      Runs in the user's storage, so the nonce lives at a fixed namespaced slot.
contract KinBatchExecutor {
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    bytes32 private constant CALL_TYPEHASH = keccak256("Call(address to,uint256 value,bytes data)");
    bytes32 private constant BATCH_TYPEHASH =
        keccak256("Batch(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NONCE_SLOT = keccak256("kin.batchexecutor.nonce");

    event Executed(uint256 indexed nonce, uint256 calls);

    error Expired();
    error BadSignature();
    error CallFailed(uint256 index, bytes reason);

    /// @notice Plain MON transfers to a delegated account must keep working.
    receive() external payable {}

    /// @notice Next batch nonce for this account.
    function nonce() public view returns (uint256 n) {
        bytes32 slot = NONCE_SLOT;
        assembly {
            n := sload(slot)
        }
    }

    /// @notice EIP-712 digest the account's key signs for `calls`.
    function batchDigest(Call[] calldata calls, uint256 n, uint256 deadline) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            hashes[i] = keccak256(abi.encode(CALL_TYPEHASH, calls[i].to, calls[i].value, keccak256(calls[i].data)));
        }
        bytes32 structHash =
            keccak256(abi.encode(BATCH_TYPEHASH, keccak256(abi.encodePacked(hashes)), n, deadline));
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("KinBatchExecutor"), keccak256("1"), block.chainid, address(this))
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    /// @notice Run `calls` in order as this account. Anyone may submit; only the account's own signature authorizes.
    function execute(Call[] calldata calls, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert Expired();
        uint256 n = nonce();
        if (ECDSA.recover(batchDigest(calls, n, deadline), signature) != address(this)) revert BadSignature();
        bytes32 slot = NONCE_SLOT;
        assembly {
            sstore(slot, add(n, 1))
        }
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory reason) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, reason);
        }
        emit Executed(n, calls.length);
    }
}
