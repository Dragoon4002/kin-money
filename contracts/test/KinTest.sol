// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {KinForwarder} from "../src/KinForwarder.sol";
import {Mock3009} from "./Mock3009.sol";

/// @notice Shared test setup: mock AUSD, forwarder, funded users, EIP-3009 + ERC-2771 signing helpers.
abstract contract KinTest is Test {
    Mock3009 ausd;
    KinForwarder fwd;

    uint256 constant ALICE_PK = 0xA11CE;
    uint256 constant BOB_PK = 0xB0B;
    uint256 constant CAROL_PK = 0xCA401;
    address alice = vm.addr(ALICE_PK);
    address bob = vm.addr(BOB_PK);
    address carol = vm.addr(CAROL_PK);
    address relayer = makeAddr("relayer");

    uint256 constant USD = 1e6;
    uint256 private _nonceSeed;

    struct Auth {
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes sig;
    }

    function setUp() public virtual {
        vm.warp(1_000_000);
        ausd = new Mock3009();
        fwd = new KinForwarder();
        ausd.mint(alice, 1_000 * USD);
        ausd.mint(bob, 1_000 * USD);
        ausd.mint(carol, 1_000 * USD);
    }

    /// @dev Sign EIP-3009 ReceiveWithAuthorization from `pk` to `to`.
    function _auth(uint256 pk, address to, uint256 value) internal returns (Auth memory a) {
        a = Auth(value, 0, block.timestamp + 1 hours, keccak256(abi.encode(++_nonceSeed)), "");
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                ),
                vm.addr(pk),
                to,
                value,
                0,
                a.validBefore,
                a.nonce
            )
        );
        // no external calls here, so helpers can sit right after vm.expectRevert
        a.sig = _sign(pk, keccak256(abi.encodePacked("\x19\x01", _domain("Agora Dollar", address(ausd)), structHash)));
    }

    function _domain(string memory name, address verifying) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256("1"),
                block.chainid,
                verifying
            )
        );
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Relayer submits `data` to `target` on behalf of `pk` via KinForwarder.execute.
    function _forward(uint256 pk, address target, bytes memory data) internal {
        address from = vm.addr(pk);
        uint48 deadline = uint48(block.timestamp + 10 minutes);
        uint256 gasLimit = 1_000_000;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                from,
                target,
                0,
                gasLimit,
                fwd.nonces(from),
                deadline,
                keccak256(data)
            )
        );
        bytes memory sig = _sign(pk, keccak256(abi.encodePacked("\x19\x01", _domain("Kin", address(fwd)), structHash)));
        vm.prank(relayer);
        fwd.execute(ERC2771Forwarder.ForwardRequestData(from, target, 0, gasLimit, deadline, data, sig));
    }
}
