// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinPot} from "../src/KinPot.sol";

contract KinPotTest is KinTest {
    KinPot pot;
    uint256 id;

    function setUp() public override {
        super.setUp();
        pot = new KinPot(address(fwd), address(ausd));
        address[] memory m = new address[](2);
        (m[0], m[1]) = (alice, bob);
        vm.prank(alice);
        id = pot.create(carol, uint96(100 * USD), m);
    }

    function _contribute(uint256 pk, uint256 value) internal {
        Auth memory a = _auth(pk, address(pot), value);
        vm.prank(vm.addr(pk));
        pot.contribute(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_AutoPaysAndCarries() public {
        _contribute(ALICE_PK, 60 * USD);
        assertEq(ausd.balanceOf(carol), 1_000 * USD);
        vm.expectEmit(address(pot));
        emit KinPot.PotPaid(id, carol, 0, 100 * USD);
        _contribute(BOB_PK, 50 * USD);
        assertEq(ausd.balanceOf(carol), 1_100 * USD);
        (,, uint96 bal, uint64 round,) = pot.pots(id);
        assertEq(bal, 10 * USD);
        assertEq(round, 1);
        assertEq(pot.contributed(id, 0, alice), 60 * USD);
        assertEq(pot.contributed(id, 0, bob), 50 * USD);

        _contribute(ALICE_PK, 250 * USD); // 260 -> pays 200, keeps 60
        assertEq(ausd.balanceOf(carol), 1_300 * USD);
        (,, bal, round,) = pot.pots(id);
        assertEq(bal, 60 * USD);
        assertEq(round, 3);
        assertEq(pot.contributed(id, 1, alice), 250 * USD);
    }

    function test_NonMemberReverts() public {
        Auth memory a = _auth(CAROL_PK, address(pot), USD);
        vm.expectRevert(KinPot.NotMember.selector);
        vm.prank(carol);
        pot.contribute(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_ContributeViaForwarder() public {
        Auth memory a = _auth(BOB_PK, address(pot), 5 * USD);
        _forward(
            BOB_PK,
            address(pot),
            abi.encodeCall(KinPot.contribute, (id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig))
        );
        assertEq(pot.contributed(id, 0, bob), 5 * USD);
        assertEq(ausd.balanceOf(address(pot)), 5 * USD);
    }

    function test_CreateRevertsBadTerms() public {
        address[] memory m = new address[](0);
        vm.expectRevert(KinPot.InvalidTerms.selector);
        vm.prank(alice);
        pot.create(carol, uint96(USD), m);

        m = new address[](21);
        for (uint256 i; i < 21; ++i) m[i] = address(uint160(i + 1));
        vm.expectRevert(KinPot.InvalidTerms.selector);
        vm.prank(address(1));
        pot.create(carol, uint96(USD), m);

        m = new address[](1);
        vm.expectRevert(KinPot.InvalidTerms.selector); // zero member
        vm.prank(carol);
        pot.create(carol, uint96(USD), m);

        m[0] = bob;
        vm.expectRevert(KinPot.InvalidTerms.selector); // creator neither member nor beneficiary
        vm.prank(alice);
        pot.create(carol, uint96(USD), m);

        vm.prank(carol); // beneficiary may create
        pot.create(carol, uint96(USD), m);
    }

    function test_CloseTakesBalance() public {
        _contribute(ALICE_PK, 40 * USD);
        vm.expectRevert(KinPot.Unauthorized.selector);
        vm.prank(alice);
        pot.close(id);

        vm.expectEmit(address(pot));
        emit KinPot.PotClosed(id, carol, 40 * USD);
        vm.prank(carol);
        pot.close(id);
        assertEq(ausd.balanceOf(carol), 1_040 * USD);
        assertEq(ausd.balanceOf(address(pot)), 0);

        vm.expectRevert(KinPot.Closed.selector);
        vm.prank(carol);
        pot.close(id);
        Auth memory a = _auth(BOB_PK, address(pot), USD);
        vm.expectRevert(KinPot.Closed.selector);
        vm.prank(bob);
        pot.contribute(id, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }
}
