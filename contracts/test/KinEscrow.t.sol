// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinEscrow} from "../src/KinEscrow.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract KinEscrowTest is KinTest {
    KinEscrow escrow;
    uint256 constant LINK_PK = 0x11E;
    address link = vm.addr(LINK_PK);
    uint256 constant AMT = 50 * USD;

    struct Terms {
        address to;
        address claimKey;
        address approver;
        uint40 unlockAt;
        uint40 expiresAt;
        uint40 autoApproveAt;
    }

    function setUp() public override {
        super.setUp();
        escrow = new KinEscrow(address(fwd), address(ausd));
    }

    function _create(Terms memory t) internal returns (uint256) {
        Auth memory a = _auth(ALICE_PK, address(escrow), AMT);
        vm.prank(alice);
        return escrow.create(
            t.to, t.claimKey, t.approver, t.unlockAt, t.expiresAt, t.autoApproveAt, a.value, a.validAfter,
            a.validBefore, a.nonce, a.sig
        );
    }

    function _claimSig(uint256 id, address recipient) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encode(address(escrow), block.chainid, id, recipient));
        return _sign(LINK_PK, MessageHashUtils.toEthSignedMessageHash(h));
    }

    function test_ClaimLink() public {
        uint256 id = _create(Terms(address(0), link, address(0), 0, uint40(block.timestamp + 1 days), 0));
        assertEq(ausd.balanceOf(address(escrow)), AMT);

        vm.expectRevert(KinEscrow.BadSignature.selector); // sig names bob, relayer tries carol
        vm.prank(relayer);
        escrow.claim(id, carol, _claimSig(id, bob));

        vm.expectRevert(KinEscrow.InvalidTerms.selector); // link escrows can't be `release`d
        escrow.release(id);

        vm.prank(relayer);
        escrow.claim(id, bob, _claimSig(id, bob));
        assertEq(ausd.balanceOf(bob), 1_000 * USD + AMT);

        vm.expectRevert(KinEscrow.AlreadySettled.selector);
        escrow.claim(id, bob, _claimSig(id, bob));
    }

    function test_EarmarkNeedsApprover() public {
        uint256 id = _create(Terms(carol, address(0), bob, 0, uint40(block.timestamp + 1 days), 0));
        vm.expectRevert(KinEscrow.NotReady.selector);
        escrow.release(id);
        vm.expectRevert(KinEscrow.Unauthorized.selector);
        vm.prank(alice);
        escrow.approve(id);

        vm.prank(bob);
        escrow.approve(id); // auto-releases
        assertEq(ausd.balanceOf(carol), 1_000 * USD + AMT);

        vm.expectRevert(KinEscrow.AlreadySettled.selector);
        escrow.release(id);
        vm.expectRevert(KinEscrow.AlreadySettled.selector);
        vm.prank(bob);
        escrow.approve(id);
    }

    function test_EmergencyPingThenApprove() public {
        uint256 id = _create(Terms(bob, address(0), alice, 0, uint40(block.timestamp + 1 days), 0));
        vm.expectRevert(KinEscrow.Unauthorized.selector);
        vm.prank(carol);
        escrow.ping(id);

        vm.expectEmit(address(escrow));
        emit KinEscrow.Requested(id, bob);
        vm.prank(bob);
        escrow.ping(id);

        vm.prank(alice);
        escrow.approve(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + AMT);
    }

    function test_GiftEarlyReleaseReverts() public {
        uint256 id = _create(Terms(bob, address(0), address(0), uint40(block.timestamp + 1 days), 0, 0));
        vm.expectRevert(KinEscrow.NotReady.selector);
        escrow.release(id);
        vm.warp(block.timestamp + 1 days);
        escrow.release(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + AMT);
    }

    function test_GiftApprovedBeforeUnlockWaits() public {
        uint256 id = _create(Terms(bob, address(0), carol, uint40(block.timestamp + 1 days), uint40(block.timestamp + 2 days), 0));
        vm.prank(carol);
        escrow.approve(id); // not unlocked -> no transfer
        assertEq(ausd.balanceOf(address(escrow)), AMT);
        vm.warp(block.timestamp + 1 days);
        escrow.release(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + AMT);
    }

    function test_InvoiceAutoApprove() public {
        uint256 id = _create(Terms(bob, address(0), carol, 0, uint40(block.timestamp + 30 days), uint40(block.timestamp + 7 days)));
        vm.warp(block.timestamp + 7 days - 1);
        vm.expectRevert(KinEscrow.NotReady.selector);
        escrow.release(id);
        vm.warp(block.timestamp + 1);
        vm.prank(relayer);
        escrow.release(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + AMT);
    }

    function test_RefundAfterExpiry() public {
        uint256 id = _create(Terms(address(0), link, address(0), 0, uint40(block.timestamp + 1 days), 0));
        vm.expectRevert(KinEscrow.NotExpired.selector);
        vm.prank(alice);
        escrow.refund(id);

        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(KinEscrow.Unauthorized.selector);
        vm.prank(bob);
        escrow.refund(id);

        vm.prank(alice);
        escrow.refund(id);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);

        vm.expectRevert(KinEscrow.AlreadySettled.selector);
        vm.prank(alice);
        escrow.refund(id);
        vm.expectRevert(KinEscrow.AlreadySettled.selector);
        escrow.claim(id, bob, _claimSig(id, bob));
    }

    function test_RefundWithoutExpiryReverts() public {
        uint256 id = _create(Terms(bob, address(0), address(0), uint40(block.timestamp + 730 days), 0, 0));
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(KinEscrow.NotExpired.selector);
        vm.prank(alice);
        escrow.refund(id);
    }

    function test_CreateRevertsBadTerms() public {
        vm.expectRevert(KinEscrow.InvalidTerms.selector);
        _create(Terms(bob, link, address(0), 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector);
        _create(Terms(address(0), address(0), address(0), 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector);
        _create(Terms(address(escrow), address(0), address(0), 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector);
        _create(Terms(address(ausd), address(0), address(0), 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector); // approver without expiry
        _create(Terms(bob, address(0), carol, 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector); // claim link without expiry
        _create(Terms(address(0), link, address(0), 0, 0, 0));
        vm.expectRevert(KinEscrow.InvalidTerms.selector); // expiry not after unlock
        _create(Terms(bob, address(0), carol, 100, 100, 0));
    }

    function test_CreateRevertsIfSenderNotSigner() public {
        Auth memory a = _auth(ALICE_PK, address(escrow), AMT);
        vm.expectRevert("invalid signature"); // bob replays alice's auth: from = bob
        vm.prank(bob);
        escrow.create(bob, address(0), address(0), 0, 0, 0, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_CreateViaForwarder() public {
        Auth memory a = _auth(ALICE_PK, address(escrow), AMT);
        bytes memory data = abi.encodeCall(
            KinEscrow.create,
            (bob, address(0), address(0), 0, 0, 0, a.value, a.validAfter, a.validBefore, a.nonce, a.sig)
        );
        _forward(ALICE_PK, address(escrow), data);
        (address from,,,,,,,,,) = escrow.escrows(1);
        assertEq(from, alice);
        assertEq(ausd.balanceOf(address(escrow)), AMT);
    }
}
