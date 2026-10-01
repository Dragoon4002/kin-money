// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinCircle} from "../src/KinCircle.sol";

contract KinCircleTest is KinTest {
    KinCircle circle;
    uint256 id;
    uint256 constant C = 10 * USD;

    function setUp() public override {
        super.setUp();
        circle = new KinCircle(address(fwd), address(ausd));
        vm.prank(alice);
        id = circle.create(_members(), uint96(C), 1 days);
    }

    function _members() internal view returns (address[] memory m) {
        m = new address[](3);
        (m[0], m[1], m[2]) = (alice, bob, carol);
    }

    function _join(uint256 pk) internal {
        Auth memory a = _auth(pk, address(circle), circle.depositFor(id, vm.addr(pk)));
        vm.prank(vm.addr(pk));
        circle.join(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function _pay(uint256 pk) internal {
        Auth memory a = _auth(pk, address(circle), C);
        vm.prank(vm.addr(pk));
        circle.pay(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function _joinAll() internal {
        _join(ALICE_PK);
        _join(BOB_PK);
        _join(CAROL_PK);
    }

    function _settleLate() internal {
        vm.warp(block.timestamp + 1 days);
        circle.settle(id);
    }

    function test_CreateRevertsBadTerms() public {
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(bob); // not members[0]
        circle.create(_members(), uint96(C), 1 days);

        address[] memory big = new address[](21);
        for (uint256 i; i < 21; ++i) big[i] = address(uint160(i + 1));
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(address(1));
        circle.create(big, uint96(C), 1 days);

        address[] memory m = _members();
        m[2] = address(0);
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, uint96(C), 1 days);

        m[2] = bob; // duplicate
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, uint96(C), 1 days);
    }

    function test_DepositsSizedBySlot() public {
        assertEq(circle.depositFor(id, alice), 2 * C);
        assertEq(circle.depositFor(id, bob), C);
        assertEq(circle.depositFor(id, carol), 0);
        vm.expectRevert(KinCircle.NotMember.selector);
        circle.depositFor(id, relayer);
    }

    function test_FullHappyPath() public {
        vm.expectRevert(KinCircle.NotActive.selector);
        _pay(ALICE_PK);
        _join(ALICE_PK);
        _join(BOB_PK);
        vm.prank(carol); // last slot: value 0, no auth needed
        circle.join(id, 0, 0, 0, bytes32(0), "");
        assertEq(ausd.balanceOf(alice), 980 * USD);
        assertEq(ausd.balanceOf(carol), 1_000 * USD);
        (,, uint40 roundStart,,,,,,) = circle.circles(id);
        assertEq(roundStart, block.timestamp);

        uint256[3] memory pks = [ALICE_PK, BOB_PK, CAROL_PK];
        for (uint256 r; r < 3; ++r) {
            for (uint256 i; i < 3; ++i) _pay(pks[i]);
            circle.settle(id); // all paid -> no need to wait
        }
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        assertEq(ausd.balanceOf(bob), 1_000 * USD);
        assertEq(ausd.balanceOf(carol), 1_000 * USD);
        assertEq(ausd.balanceOf(address(circle)), 0);

        vm.expectRevert(KinCircle.NotActive.selector);
        circle.settle(id);
    }

    function test_Guards() public {
        Auth memory a = _auth(ALICE_PK, address(circle), C); // wrong size (needs 2C)
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.join(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);

        _join(ALICE_PK);
        a = _auth(ALICE_PK, address(circle), 2 * C);
        vm.expectRevert(KinCircle.AlreadyJoined.selector);
        vm.prank(alice);
        circle.join(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);

        a = _auth(0xDEAD, address(circle), C);
        vm.expectRevert(KinCircle.NotMember.selector);
        vm.prank(vm.addr(0xDEAD));
        circle.join(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);

        vm.expectRevert(KinCircle.NotActive.selector); // leave before joinBy
        vm.prank(alice);
        circle.leave(id);

        _join(BOB_PK);
        _join(CAROL_PK);
        _pay(ALICE_PK);
        vm.expectRevert(KinCircle.AlreadyPaid.selector);
        _pay(ALICE_PK);
        vm.expectRevert(KinCircle.RoundNotOver.selector);
        circle.settle(id);
    }

    function test_JoinDeadlineThenLeave() public {
        _join(ALICE_PK);
        _join(CAROL_PK);
        vm.warp(block.timestamp + 3 days);
        Auth memory a = _auth(BOB_PK, address(circle), C);
        vm.expectRevert(KinCircle.NotActive.selector);
        vm.prank(bob);
        circle.join(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);

        vm.expectRevert(KinCircle.NotMember.selector); // never joined
        vm.prank(bob);
        circle.leave(id);

        vm.expectEmit(address(circle));
        emit KinCircle.Left(id, alice, 2 * C);
        vm.prank(alice);
        circle.leave(id);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        vm.prank(carol);
        circle.leave(id); // zero deposit
        assertEq(ausd.balanceOf(address(circle)), 0);

        vm.expectRevert(KinCircle.NotMember.selector); // double leave
        vm.prank(alice);
        circle.leave(id);
    }

    function test_LeaveRevertsOnceStarted() public {
        _joinAll();
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(KinCircle.NotActive.selector);
        vm.prank(alice);
        circle.leave(id);
    }

    /// @dev Alice takes the round-0 pot then stops paying: her deposit covers her, nobody is shorted.
    function test_EarlyExitDefaultCantProfit() public {
        _joinAll();
        for (uint256 i; i < 3; ++i) _pay([ALICE_PK, BOB_PK, CAROL_PK][i]);
        circle.settle(id);

        _pay(BOB_PK);
        _pay(CAROL_PK);
        vm.expectEmit(address(circle));
        emit KinCircle.Defaulted(id, alice, 1, C);
        _settleLate();
        vm.expectRevert(KinCircle.IsDefaulted.selector);
        _pay(ALICE_PK);

        _pay(BOB_PK);
        _pay(CAROL_PK);
        _settleLate();
        assertEq(ausd.balanceOf(alice), 1_000 * USD); // -20 dep -10 +30
        assertEq(ausd.balanceOf(bob), 1_000 * USD); // full 30 pot
        assertEq(ausd.balanceOf(carol), 1_000 * USD);
        assertEq(ausd.balanceOf(address(circle)), 0);
    }

    /// @dev Bob defaults before his slot: deposit covers round 0, his round-1 pot is forfeited and shared.
    function test_DefaultBeforeSlotForfeits() public {
        _joinAll();
        _pay(ALICE_PK);
        _pay(CAROL_PK);
        _settleLate(); // bob's 10 deposit covers -> alice gets 30
        (,, bool defaulted,,, uint96 dep) = circle.memberInfo(id, bob);
        assertTrue(defaulted);
        assertEq(dep, 0);

        _pay(ALICE_PK);
        _pay(CAROL_PK);
        vm.expectEmit(address(circle));
        emit KinCircle.Forfeited(id, bob, 1, 2 * C);
        _settleLate();

        _pay(ALICE_PK);
        _pay(CAROL_PK);
        _settleLate(); // carol gets 20 (bob uncovered), forfeit 20 split alice/carol
        assertEq(ausd.balanceOf(alice), 1_010 * USD); // -20 dep -30 +30 +20 dep back +10 share
        assertEq(ausd.balanceOf(bob), 990 * USD); // defaulting never profits
        assertEq(ausd.balanceOf(carol), 1_000 * USD); // -30 +20 +10 share
        assertEq(ausd.balanceOf(address(circle)), 0);
    }

    function test_JoinViaForwarder() public {
        Auth memory a = _auth(BOB_PK, address(circle), C);
        _forward(
            BOB_PK,
            address(circle),
            abi.encodeCall(KinCircle.join, (id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig))
        );
        (, bool joined,,,, uint96 dep) = circle.memberInfo(id, bob);
        assertTrue(joined);
        assertEq(dep, C);
    }
}
