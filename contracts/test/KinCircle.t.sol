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
        id = circle.create(_members(), 3, uint96(C), 1 days);
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
        circle.create(_members(), 3, uint96(C), 1 days);

        address[] memory big = new address[](21);
        for (uint256 i; i < 21; ++i) big[i] = address(uint160(i + 1));
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(address(1));
        circle.create(big, 20, uint96(C), 1 days);

        address[] memory m = _members();
        m[2] = address(0);
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, 3, uint96(C), 1 days);

        m[2] = bob; // duplicate
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, 3, uint96(C), 1 days);

        vm.expectRevert(KinCircle.InvalidTerms.selector); // more members than seats
        vm.prank(alice);
        circle.create(_members(), 2, uint96(C), 1 days);

        vm.expectRevert(KinCircle.InvalidTerms.selector); // a circle of one
        vm.prank(alice);
        circle.create(_solo(), 1, uint96(C), 1 days);
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
        (,, uint40 roundStart,,,,,,,) = circle.circles(id);
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

    // ---------- invite links (open seats) ----------

    uint256 constant KEY_A = 0xAAA1; // alice's link key
    uint256 constant KEY_B = 0xBBB1; // bob's link key
    uint256 constant DAVE_PK = 0xDA7E;

    function _solo() internal view returns (address[] memory m) {
        m = new address[](1);
        m[0] = alice;
    }

    /// @dev Alice opens a 3-seat circle alone and turns on her invite link.
    function _openCircle() internal returns (uint256 oid) {
        vm.startPrank(alice);
        oid = circle.create(_solo(), 3, uint96(C), 1 days);
        circle.setInviteKey(oid, vm.addr(KEY_A));
        vm.stopPrank();
    }

    function _seatSig(uint256 keyPk, uint256 cid, address inviter, address member) internal view returns (bytes memory) {
        return _sign(
            keyPk,
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    keccak256(abi.encode(address(circle), block.chainid, cid, inviter, member))
                )
            )
        );
    }

    function _joinIn(uint256 cid, uint256 pk) internal {
        Auth memory a = _auth(pk, address(circle), circle.depositFor(cid, vm.addr(pk)));
        vm.prank(vm.addr(pk));
        circle.join(cid, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    /// @dev Alice invites Bob, Bob (not the creator) invites Carol; all join, full circle settles.
    function test_InviteChainFullCircle() public {
        uint256 oid = _openCircle();
        _joinIn(oid, ALICE_PK);
        assertEq(circle.depositFor(oid, alice), 2 * C);

        vm.expectEmit(address(circle));
        emit KinCircle.SeatClaimed(oid, bob, alice);
        vm.prank(relayer); // anyone may submit
        circle.claimSeat(oid, alice, bob, _seatSig(KEY_A, oid, alice, bob));
        _joinIn(oid, BOB_PK);

        vm.prank(bob);
        circle.setInviteKey(oid, vm.addr(KEY_B));
        circle.claimSeat(oid, bob, carol, _seatSig(KEY_B, oid, bob, carol));
        (,, uint40 roundStart,,,,,,,) = circle.circles(oid);
        assertEq(roundStart, 0);
        _joinIn(oid, CAROL_PK);

        // deposits never moved as seats filled: slot order = join order
        assertEq(circle.depositFor(oid, alice), 2 * C);
        assertEq(circle.depositFor(oid, bob), C);
        assertEq(circle.depositFor(oid, carol), 0);
        address[] memory ms = circle.membersOf(oid);
        assertEq(ms.length, 3);
        assertEq(ms[0], alice);
        assertEq(ms[1], bob);
        assertEq(ms[2], carol);
        (,, roundStart,,,,,,,) = circle.circles(oid);
        assertEq(roundStart, block.timestamp);

        vm.expectRevert(KinCircle.NotActive.selector); // links die once started
        vm.prank(alice);
        circle.setInviteKey(oid, address(0));

        uint256[3] memory pks = [ALICE_PK, BOB_PK, CAROL_PK];
        for (uint256 r; r < 3; ++r) {
            for (uint256 i; i < 3; ++i) {
                Auth memory a = _auth(pks[i], address(circle), C);
                vm.prank(vm.addr(pks[i]));
                circle.pay(oid, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
            }
            vm.expectEmit(address(circle));
            emit KinCircle.PaidOut(oid, ms[r], r, 3 * C);
            circle.settle(oid);
        }
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        assertEq(ausd.balanceOf(bob), 1_000 * USD);
        assertEq(ausd.balanceOf(carol), 1_000 * USD);
        assertEq(ausd.balanceOf(address(circle)), 0);
    }

    function test_ClaimSeatRejects() public {
        uint256 oid = _openCircle();

        vm.expectRevert(KinCircle.BadSignature.selector); // wrong key
        circle.claimSeat(oid, alice, bob, _seatSig(KEY_B, oid, alice, bob));

        vm.expectRevert(KinCircle.BadSignature.selector); // sig for bob can't seat carol
        circle.claimSeat(oid, alice, carol, _seatSig(KEY_A, oid, alice, bob));

        vm.expectRevert(KinCircle.NotMember.selector); // bob has no link (not a member)
        circle.claimSeat(oid, bob, carol, _seatSig(KEY_A, oid, bob, carol));

        vm.expectRevert(KinCircle.NotMember.selector); // non-member can't set a key
        vm.prank(bob);
        circle.setInviteKey(oid, vm.addr(KEY_B));

        circle.claimSeat(oid, alice, bob, _seatSig(KEY_A, oid, alice, bob));
        assertEq(circle.inviteKeyOf(oid, alice), address(0)); // one seat per link
        vm.expectRevert(KinCircle.NotMember.selector); // replay: link used up
        circle.claimSeat(oid, alice, bob, _seatSig(KEY_A, oid, alice, bob));
        vm.expectRevert(KinCircle.NotMember.selector); // same link can't seat a second person
        circle.claimSeat(oid, alice, carol, _seatSig(KEY_A, oid, alice, carol));
        vm.prank(alice);
        circle.setInviteKey(oid, vm.addr(KEY_A)); // fresh link (same key reused here for brevity)
        vm.expectRevert(KinCircle.AlreadyJoined.selector);
        circle.claimSeat(oid, alice, bob, _seatSig(KEY_A, oid, alice, bob));

        vm.prank(bob);
        circle.setInviteKey(oid, vm.addr(KEY_B));
        // inviter binding: alice's key can't sign as bob's invite
        vm.expectRevert(KinCircle.BadSignature.selector);
        circle.claimSeat(oid, bob, carol, _seatSig(KEY_A, oid, bob, carol));

        vm.prank(bob); // bob turns his link off
        circle.setInviteKey(oid, address(0));
        vm.expectRevert(KinCircle.NotMember.selector);
        circle.claimSeat(oid, bob, carol, _seatSig(KEY_B, oid, bob, carol));

        circle.claimSeat(oid, alice, carol, _seatSig(KEY_A, oid, alice, carol));
        address dave = vm.addr(DAVE_PK);
        vm.expectRevert(KinCircle.Full.selector);
        circle.claimSeat(oid, alice, dave, _seatSig(KEY_A, oid, alice, dave));
    }

    function test_ClaimSeatRejectsContractOrToken() public {
        uint256 oid = _openCircle();
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        circle.claimSeat(oid, alice, address(circle), _seatSig(KEY_A, oid, alice, address(circle)));
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        circle.claimSeat(oid, alice, address(ausd), _seatSig(KEY_A, oid, alice, address(ausd)));

        address[] memory m = _members();
        m[2] = address(circle);
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, 3, uint96(C), 1 days);
        m[2] = address(ausd);
        vm.expectRevert(KinCircle.InvalidTerms.selector);
        vm.prank(alice);
        circle.create(m, 3, uint96(C), 1 days);
    }

    function test_ClaimSeatAfterStartOrDeadline() public {
        // 3 seats, 2 known: started circles can't take seats (fills before start anyway) -> check deadline
        address[] memory two = new address[](2);
        (two[0], two[1]) = (alice, bob);
        vm.prank(alice);
        uint256 oid = circle.create(two, 3, uint96(C), 1 days);
        vm.prank(alice);
        circle.setInviteKey(oid, vm.addr(KEY_A));
        assertEq(circle.depositFor(oid, bob), C); // sized by seats, not listed members

        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(KinCircle.NotActive.selector);
        circle.claimSeat(oid, alice, carol, _seatSig(KEY_A, oid, alice, carol));

        // started (main 3-seat circle full): setInviteKey/claimSeat rejected
        vm.warp(1_000_000);
        _joinAll();
        vm.expectRevert(KinCircle.NotActive.selector);
        vm.prank(alice);
        circle.setInviteKey(id, vm.addr(KEY_A));
        vm.expectRevert(KinCircle.NotActive.selector);
        circle.claimSeat(id, alice, vm.addr(DAVE_PK), _seatSig(KEY_A, id, alice, vm.addr(DAVE_PK)));
    }
}
