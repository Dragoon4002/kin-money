// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinMandate} from "../src/KinMandate.sol";

contract KinMandateTest is KinTest {
    KinMandate mandate;
    uint32 constant MONTH = 30 days;

    function setUp() public override {
        super.setUp();
        mandate = new KinMandate(address(fwd), address(ausd));
    }

    function _create(uint80 amount, uint32 period, uint16 periods) internal returns (uint256) {
        Auth memory a = _auth(ALICE_PK, address(mandate), uint256(amount) * periods);
        vm.prank(alice);
        return mandate.create(bob, amount, period, periods, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_HappyPath() public {
        uint256 t0 = block.timestamp;
        uint256 id = _create(uint80(100 * USD), MONTH, 3);
        assertEq(ausd.balanceOf(address(mandate)), 300 * USD);

        vm.warp(t0 + MONTH);
        mandate.collect(id); // anyone may collect, pays bob
        assertEq(ausd.balanceOf(bob), 1_100 * USD);

        vm.warp(t0 + 10 * MONTH); // late: both remaining paid in one go, never more
        assertEq(mandate.due(id), 2);
        vm.prank(bob);
        mandate.collect(id);
        assertEq(ausd.balanceOf(bob), 1_300 * USD);
        assertEq(ausd.balanceOf(address(mandate)), 0);

        vm.expectRevert(KinMandate.NothingDue.selector);
        mandate.collect(id);
        vm.expectRevert(KinMandate.Finished.selector);
        vm.prank(alice);
        mandate.cancel(id);
    }

    function test_EarlyCollectReverts() public {
        uint256 t0 = block.timestamp;
        uint256 id = _create(uint80(100 * USD), MONTH, 3);
        vm.expectRevert(KinMandate.NothingDue.selector);
        mandate.collect(id);
        vm.warp(t0 + MONTH - 1); // one second short of boundary
        vm.expectRevert(KinMandate.NothingDue.selector);
        mandate.collect(id);
        vm.warp(t0 + MONTH);
        mandate.collect(id);
        vm.warp(t0 + 2 * MONTH - 1); // double-collect within same period
        vm.expectRevert(KinMandate.NothingDue.selector);
        mandate.collect(id);
    }

    function test_CancelMidway() public {
        uint256 t0 = block.timestamp;
        uint256 id = _create(uint80(100 * USD), MONTH, 5);
        vm.warp(t0 + MONTH);
        mandate.collect(id); // 1 paid
        vm.warp(t0 + 3 * MONTH + 5); // 2 more due, 2 not yet

        vm.prank(alice);
        mandate.cancel(id);
        assertEq(ausd.balanceOf(bob), 1_300 * USD);
        assertEq(ausd.balanceOf(alice), 1_000 * USD - 300 * USD);
        assertEq(ausd.balanceOf(address(mandate)), 0);

        vm.warp(t0 + 100 * MONTH);
        assertEq(mandate.due(id), 0);
        vm.expectRevert(KinMandate.NothingDue.selector);
        mandate.collect(id);
        vm.expectRevert(KinMandate.Finished.selector);
        vm.prank(alice);
        mandate.cancel(id);
    }

    function test_CancelBeforeFirstRefundsAll() public {
        uint256 id = _create(uint80(100 * USD), MONTH, 2);
        vm.prank(alice);
        mandate.cancel(id);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        assertEq(ausd.balanceOf(bob), 1_000 * USD);
    }

    function test_CancelUnauthorized() public {
        uint256 id = _create(uint80(100 * USD), MONTH, 2);
        vm.expectRevert(KinMandate.Unauthorized.selector);
        vm.prank(bob);
        mandate.cancel(id);
        vm.expectRevert(KinMandate.Unauthorized.selector);
        vm.prank(carol);
        mandate.cancel(id);
    }

    function test_SinglePeriod() public {
        uint256 t0 = block.timestamp;
        uint256 id = _create(7, 300, 1);
        vm.warp(t0 + 299);
        assertEq(mandate.due(id), 0);
        vm.warp(t0 + 300);
        mandate.collect(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + 7);
    }

    function test_MaxPeriods() public {
        uint256 t0 = block.timestamp;
        uint16 max = type(uint16).max;
        uint256 id = _create(1, 1, max);
        vm.warp(t0 + uint256(max) * 10);
        assertEq(mandate.due(id), max);
        mandate.collect(id);
        assertEq(ausd.balanceOf(bob), 1_000 * USD + max);
        assertEq(ausd.balanceOf(address(mandate)), 0);
    }

    function test_CreateRevertsBadTerms() public {
        Auth memory a = _auth(ALICE_PK, address(mandate), 299);
        vm.expectRevert(KinMandate.InvalidTerms.selector); // value != amount * periods
        vm.prank(alice);
        mandate.create(bob, 100, 1, 3, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinMandate.InvalidTerms.selector);
        vm.prank(alice);
        mandate.create(bob, 299, 0, 1, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinMandate.InvalidTerms.selector);
        vm.prank(alice);
        mandate.create(address(0), 299, 1, 1, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_CancelViaForwarder() public {
        uint256 t0 = block.timestamp;
        uint256 id = _create(uint80(100 * USD), MONTH, 2);
        vm.warp(t0 + MONTH);
        _forward(ALICE_PK, address(mandate), abi.encodeCall(KinMandate.cancel, (id)));
        assertEq(ausd.balanceOf(bob), 1_100 * USD);
        assertEq(ausd.balanceOf(alice), 900 * USD);
    }
}
