// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {KinTest} from "./KinTest.sol";
import {KinNames} from "../src/KinNames.sol";
import {KinPot} from "../src/KinPot.sol";

/// @notice Idempotency of the two relay paths: a resubmitted signed request / authorization must never run twice.
contract KinReplayTest is KinTest {
    KinNames names;
    KinPot pot;

    function setUp() public override {
        super.setUp();
        names = new KinNames(address(fwd));
        pot = new KinPot(address(fwd), address(ausd));
    }

    function _request(uint256 pk, address target, bytes memory data)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory r)
    {
        address from = vm.addr(pk);
        r = ERC2771Forwarder.ForwardRequestData(from, target, 0, 1_000_000, uint48(block.timestamp + 10 minutes), data, "");
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                from,
                target,
                0,
                r.gas,
                fwd.nonces(from),
                r.deadline,
                keccak256(data)
            )
        );
        r.signature = _sign(pk, keccak256(abi.encodePacked("\x19\x01", _domain("Kin", address(fwd)), structHash)));
    }

    function test_SameForwardRequestRunsOnce() public {
        ERC2771Forwarder.ForwardRequestData memory r = _request(ALICE_PK, address(names), abi.encodeCall(KinNames.claim, ("alice")));
        vm.prank(relayer);
        fwd.execute(r);
        assertEq(fwd.nonces(alice), 1);

        vm.expectRevert(); // nonce consumed → signature recovers to someone else
        vm.prank(relayer);
        fwd.execute(r);
        assertEq(fwd.nonces(alice), 1);
    }

    function test_TwoRequestsSignedForSameNonceOnlyOneLands() public {
        // Relay audit case: same forwarder nonce, different payloads — the second must not execute.
        ERC2771Forwarder.ForwardRequestData memory a = _request(ALICE_PK, address(names), abi.encodeCall(KinNames.claim, ("alice")));
        ERC2771Forwarder.ForwardRequestData memory b = _request(ALICE_PK, address(names), abi.encodeCall(KinNames.claim, ("alice2")));
        vm.prank(relayer);
        fwd.execute(a);
        vm.expectRevert();
        vm.prank(relayer);
        fwd.execute(b);
    }

    function test_FundAuthorizationUsableOnce() public {
        address[] memory to = new address[](1);
        to[0] = carol;
        address[] memory members = new address[](1);
        members[0] = alice;
        vm.prank(alice);
        uint256 id = pot.create(to, false, uint96(100 * USD), members, address(0));
        Auth memory a = _auth(ALICE_PK, address(pot), 10 * USD);
        vm.prank(alice);
        pot.contribute(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        assertEq(ausd.balanceOf(address(pot)), 10 * USD);

        vm.expectRevert(bytes("authorization is used"));
        vm.prank(alice);
        pot.contribute(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        assertEq(ausd.balanceOf(address(pot)), 10 * USD);
    }
}
