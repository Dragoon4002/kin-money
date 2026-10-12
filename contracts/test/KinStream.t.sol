// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinStream} from "../src/KinStream.sol";

contract KinStreamTest is KinTest {
    KinStream stream;

    function setUp() public override {
        super.setUp();
        stream = new KinStream(address(fwd), address(ausd));
    }

    function _create(uint256 value, uint40 duration) internal returns (uint256) {
        Auth memory a = _auth(ALICE_PK, address(stream), value);
        vm.prank(alice);
        return stream.create(bob, duration, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_BoundaryRounding() public {
        uint256 t0 = vm.getBlockTimestamp(); // block.timestamp is cached under --ir-minimum
        uint256 id = _create(10, 3); // rate 3.33/s
        assertEq(stream.accrued(id), 0);
        vm.expectRevert(KinStream.NothingToWithdraw.selector);
        vm.prank(bob);
        stream.withdraw(id);

        vm.warp(t0 + 1);
        assertEq(stream.accrued(id), 3);
        vm.prank(bob);
        stream.withdraw(id);
        vm.warp(t0 + 2);
        assertEq(stream.accrued(id), 3);
        vm.warp(t0 + 3); // end: remainder incl. dust
        assertEq(stream.accrued(id), 7);
        vm.warp(t0 + 100);
        vm.prank(bob);
        stream.withdraw(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + 10);
        assertEq(ausd.balanceOf(address(stream)), 0);
    }

    function test_WithdrawUnauthorized() public {
        uint256 id = _create(100 * USD, 100);
        vm.warp(block.timestamp + 10);
        vm.expectRevert(KinStream.Unauthorized.selector);
        vm.prank(carol);
        stream.withdraw(id);
    }

    function test_CancelSplits() public {
        uint256 id = _create(1_000 * USD, 100);
        vm.warp(block.timestamp + 10);
        vm.prank(bob);
        stream.withdraw(id); // 100
        vm.warp(block.timestamp + 15);

        vm.expectRevert(KinStream.Unauthorized.selector);
        vm.prank(bob);
        stream.cancel(id);

        vm.prank(alice);
        stream.cancel(id); // payee +150, payer +750
        assertEq(ausd.balanceOf(bob), 1_250 * USD);
        assertEq(ausd.balanceOf(alice), 750 * USD);
        assertEq(stream.accrued(id), 0);

        vm.warp(block.timestamp + 1_000);
        assertEq(stream.accrued(id), 0);
        vm.expectRevert(KinStream.NothingToWithdraw.selector);
        vm.prank(alice);
        stream.cancel(id);
        vm.expectRevert(KinStream.NothingToWithdraw.selector);
        vm.prank(bob);
        stream.withdraw(id);
    }

    function test_CreateRevertsBadTerms() public {
        Auth memory a = _auth(ALICE_PK, address(stream), 1);
        vm.expectRevert(KinStream.InvalidTerms.selector);
        vm.prank(alice);
        stream.create(bob, 0, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinStream.InvalidTerms.selector); // funds would be stuck in the contract
        vm.prank(alice);
        stream.create(address(stream), 10, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinStream.InvalidTerms.selector);
        vm.prank(alice);
        stream.create(address(ausd), 10, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_WithdrawViaForwarder() public {
        uint256 id = _create(100 * USD, 100);
        vm.warp(block.timestamp + 50);
        _forward(BOB_PK, address(stream), abi.encodeCall(KinStream.withdraw, (id)));
        assertEq(ausd.balanceOf(bob), 1_050 * USD);
    }
}
