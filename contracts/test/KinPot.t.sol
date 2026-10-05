// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinPot} from "../src/KinPot.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract KinPotTest is KinTest {
    KinPot pot;
    uint256 id;
    uint256 constant KEY_PK = 0xBEEF;
    uint256 constant BOB_KEY_PK = 0xB0B5EED;

    function setUp() public override {
        super.setUp();
        pot = new KinPot(address(fwd), address(ausd));
        address[] memory m = new address[](2);
        (m[0], m[1]) = (alice, bob);
        vm.prank(alice);
        id = pot.create(_one(carol), false, uint96(100 * USD), m, vm.addr(KEY_PK));
    }

    function _one(address a) internal pure returns (address[] memory l) {
        l = new address[](1);
        l[0] = a;
    }

    function _none() internal pure returns (address[] memory) {
        return new address[](0);
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
        emit KinPot.PotPaid(id, 0, 100 * USD, _one(carol));
        _contribute(BOB_PK, 50 * USD);
        assertEq(ausd.balanceOf(carol), 1_100 * USD);
        (, uint96 bal, uint64 round,,) = pot.pots(id);
        assertEq(bal, 10 * USD);
        assertEq(round, 1);
        assertEq(pot.contributed(id, 0, alice), 60 * USD);
        assertEq(pot.contributed(id, 0, bob), 50 * USD);

        _contribute(ALICE_PK, 250 * USD); // 260 -> pays 200, keeps 60
        assertEq(ausd.balanceOf(carol), 1_300 * USD);
        (, bal, round,,) = pot.pots(id);
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
        pot.create(_one(carol), false, uint96(USD), m, address(0));

        m = new address[](21);
        for (uint256 i; i < 21; ++i) {
            m[i] = address(uint160(i + 1));
        }
        vm.expectRevert(KinPot.InvalidTerms.selector);
        vm.prank(address(1));
        pot.create(_one(carol), false, uint96(USD), m, address(0));

        m = new address[](1);
        vm.expectRevert(KinPot.InvalidTerms.selector); // zero member
        vm.prank(carol);
        pot.create(_one(carol), false, uint96(USD), m, address(0));

        m[0] = bob;
        vm.expectRevert(KinPot.InvalidTerms.selector); // creator neither member nor beneficiary
        vm.prank(alice);
        pot.create(_one(carol), false, uint96(USD), m, address(0));

        vm.prank(carol); // beneficiary may create
        pot.create(_one(carol), false, uint96(USD), m, address(0));
    }

    function test_CloseTakesBalance() public {
        _contribute(ALICE_PK, 40 * USD);
        vm.expectRevert(KinPot.Unauthorized.selector);
        vm.prank(alice);
        pot.close(id);

        vm.expectEmit(address(pot));
        emit KinPot.PotClosed(id, 40 * USD, _one(carol));
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

    function _joinSig(uint256 pk, uint256 potId, address inviter, address member) internal view returns (bytes memory) {
        return _sign(
            pk,
            MessageHashUtils.toEthSignedMessageHash(
                keccak256(abi.encode(address(pot), block.chainid, potId, inviter, member))
            )
        );
    }

    function test_JoinViaLink() public {
        assertEq(pot.inviteKeyOf(id, alice), vm.addr(KEY_PK));
        vm.expectEmit(address(pot));
        emit KinPot.Joined(id, carol, alice);
        vm.prank(relayer); // anyone may submit
        pot.join(id, alice, carol, _joinSig(KEY_PK, id, alice, carol));
        assertTrue(pot.isMember(id, carol));
        assertEq(pot.membersOf(id).length, 3);
        _contribute(CAROL_PK, 5 * USD);
        assertEq(pot.contributed(id, 0, carol), 5 * USD);
    }

    function test_JoinViaForwarder() public {
        _forward(
            CAROL_PK, address(pot), abi.encodeCall(KinPot.join, (id, alice, carol, _joinSig(KEY_PK, id, alice, carol)))
        );
        assertTrue(pot.isMember(id, carol));
    }

    function test_NonCreatorMemberInvites() public {
        vm.prank(bob);
        pot.setInviteKey(id, vm.addr(BOB_KEY_PK));
        pot.join(id, bob, carol, _joinSig(BOB_KEY_PK, id, bob, carol));
        assertTrue(pot.isMember(id, carol));
        assertEq(pot.inviteKeyOf(id, bob), address(0)); // link used up
        assertTrue(pot.joinedByLink(id, carol));
    }

    /// @dev Audit fix: someone who joined by link can't mint links (no invite chains / sybil fill).
    function test_LinkJoinerCantInvite() public {
        pot.join(id, alice, carol, _joinSig(KEY_PK, id, alice, carol));
        vm.expectRevert(KinPot.Unauthorized.selector);
        vm.prank(carol);
        pot.setInviteKey(id, vm.addr(CAROL_PK));
        assertEq(pot.inviteKeyOf(id, carol), address(0));
    }

    /// @dev Audit regression: a leaked link admits exactly one person, so it can't be used to fill a toAll pot.
    function test_LeakedLinkAdmitsOnlyOne() public {
        address s1 = makeAddr("sybil1");
        address s2 = makeAddr("sybil2");
        pot.join(id, alice, s1, _joinSig(KEY_PK, id, alice, s1));
        bytes memory again = _joinSig(KEY_PK, id, alice, s2);
        vm.expectRevert(KinPot.InvalidTerms.selector); // key cleared
        pot.join(id, alice, s2, again);
        assertEq(pot.membersOf(id).length, 3);
    }

    function test_NonMemberCantSetKey() public {
        vm.expectRevert(KinPot.NotMember.selector);
        vm.prank(carol); // beneficiary, not member
        pot.setInviteKey(id, carol);
        vm.expectRevert(KinPot.NotMember.selector);
        pot.setInviteKey(999, address(this)); // no such pot
    }

    function test_JoinWrongKeyReverts() public {
        bytes memory s = _joinSig(CAROL_PK, id, alice, carol);
        vm.expectRevert(KinPot.BadSignature.selector);
        pot.join(id, alice, carol, s);
    }

    function test_JoinNoLinkReverts() public {
        bytes memory s = _joinSig(KEY_PK, id, bob, carol);
        vm.expectRevert(KinPot.InvalidTerms.selector); // bob has no link
        pot.join(id, bob, carol, s);
        s = _joinSig(KEY_PK, id, carol, carol);
        vm.expectRevert(KinPot.InvalidTerms.selector); // non-member inviter
        pot.join(id, carol, carol, s);
    }

    function test_SigForOneInviterCantBeUsedWithAnother() public {
        vm.prank(bob);
        pot.setInviteKey(id, vm.addr(KEY_PK)); // even with the same key, the inviter is bound into the sig
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.BadSignature.selector);
        pot.join(id, bob, carol, s);
    }

    function test_JoinSigForOneCantAddAnother() public {
        address dave = makeAddr("dave");
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.BadSignature.selector);
        pot.join(id, alice, dave, s);
    }

    function test_JoinTwiceReverts() public {
        pot.join(id, alice, carol, _joinSig(KEY_PK, id, alice, carol));
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.InvalidTerms.selector); // the link was used up
        pot.join(id, alice, carol, s);
        vm.prank(alice);
        pot.setInviteKey(id, vm.addr(KEY_PK)); // fresh link
        s = _joinSig(KEY_PK, id, alice, bob);
        vm.expectRevert(KinPot.AlreadyMember.selector);
        pot.join(id, alice, bob, s);
    }

    function test_JoinFullReverts() public {
        for (uint256 i = 3; i <= 20; ++i) {
            address a = address(uint160(0x1000 + i));
            vm.prank(alice);
            pot.setInviteKey(id, vm.addr(KEY_PK)); // one link per invitee
            pot.join(id, alice, a, _joinSig(KEY_PK, id, alice, a));
        }
        assertEq(pot.membersOf(id).length, 20);
        vm.prank(alice);
        pot.setInviteKey(id, vm.addr(KEY_PK));
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.Full.selector);
        pot.join(id, alice, carol, s);
    }

    /// @dev Audit regression: in a toAll pot, a link-joiner can't `close` straight away and take a share.
    function test_LinkJoinerCantCloseToAllPot() public {
        address[] memory m = new address[](2);
        (m[0], m[1]) = (alice, bob);
        vm.prank(alice);
        uint256 all = pot.create(new address[](0), true, uint96(1_000 * USD), m, vm.addr(KEY_PK));
        _contributeTo(ALICE_PK, all, 450 * USD);
        _contributeTo(BOB_PK, all, 450 * USD);
        address eve = makeAddr("eve");
        pot.join(all, alice, eve, _joinSig(KEY_PK, all, alice, eve));
        vm.expectRevert(KinPot.Unauthorized.selector);
        vm.prank(eve);
        pot.close(all);
        vm.prank(bob); // an original member still can
        pot.close(all);
        assertEq(ausd.balanceOf(eve), 300 * USD); // ...and the joiner, now a member, shares like everyone else
    }

    function test_CreateRejectsContractOrDollarAsRecipient() public {
        address[] memory m = new address[](1);
        m[0] = alice;
        vm.prank(alice);
        vm.expectRevert(KinPot.InvalidTerms.selector);
        pot.create(_one(address(pot)), false, uint96(10 * USD), m, address(0));
        vm.prank(alice);
        vm.expectRevert(KinPot.InvalidTerms.selector);
        pot.create(_one(address(ausd)), false, uint96(10 * USD), m, address(0));
    }

    function test_DisableOnlyAffectsOwnLink() public {
        vm.prank(bob);
        pot.setInviteKey(id, vm.addr(BOB_KEY_PK));
        vm.expectEmit(address(pot));
        emit KinPot.InviteKeySet(id, alice, address(0));
        vm.prank(alice);
        pot.setInviteKey(id, address(0));
        assertEq(pot.inviteKeyOf(id, bob), vm.addr(BOB_KEY_PK));
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.InvalidTerms.selector);
        pot.join(id, alice, carol, s);
        pot.join(id, bob, carol, _joinSig(BOB_KEY_PK, id, bob, carol)); // bob's link still works
        assertTrue(pot.isMember(id, carol));
    }

    function test_RotatedKeyKillsOldLink() public {
        vm.prank(alice);
        pot.setInviteKey(id, vm.addr(BOB_KEY_PK));
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.BadSignature.selector);
        pot.join(id, alice, carol, s);
        pot.join(id, alice, carol, _joinSig(BOB_KEY_PK, id, alice, carol));
    }

    function test_JoinClosedReverts() public {
        vm.prank(carol);
        pot.close(id);
        bytes memory s = _joinSig(KEY_PK, id, alice, carol);
        vm.expectRevert(KinPot.Closed.selector);
        pot.join(id, alice, carol, s);
    }

    function test_CreateKeyNeedsMemberCreator() public {
        address[] memory m = new address[](1);
        m[0] = bob;
        vm.expectRevert(KinPot.InvalidTerms.selector); // beneficiary-only creator can't hold a link
        vm.prank(carol);
        pot.create(_one(carol), false, uint96(USD), m, vm.addr(KEY_PK));
    }

    function test_CreateRevertsBadBeneficiaries() public {
        address[] memory m = _one(alice);
        vm.startPrank(alice);
        vm.expectRevert(KinPot.InvalidTerms.selector); // fixed list but empty
        pot.create(_none(), false, uint96(USD), m, address(0));
        vm.expectRevert(KinPot.InvalidTerms.selector); // toAll with a list
        pot.create(_one(carol), true, uint96(USD), m, address(0));
        address[] memory b = new address[](2);
        (b[0], b[1]) = (carol, carol);
        vm.expectRevert(KinPot.InvalidTerms.selector); // duplicate
        pot.create(b, false, uint96(USD), m, address(0));
        b[1] = address(0);
        vm.expectRevert(KinPot.InvalidTerms.selector); // zero
        pot.create(b, false, uint96(USD), m, address(0));
        b = new address[](21);
        for (uint256 i; i < 21; ++i) {
            b[i] = address(uint160(i + 1));
        }
        vm.expectRevert(KinPot.InvalidTerms.selector); // too many
        pot.create(b, false, uint96(USD), m, address(0));
        vm.stopPrank();
    }

    function test_SplitWithRemainder() public {
        address dave = makeAddr("dave");
        address[] memory b = new address[](3);
        (b[0], b[1], b[2]) = (carol, dave, bob);
        vm.prank(alice);
        uint256 p = pot.create(b, false, uint96(100 * USD + 2), _one(alice), address(0));
        assertEq(pot.beneficiariesOf(p).length, 3);
        uint256 c0 = ausd.balanceOf(carol);
        uint256 b0 = ausd.balanceOf(bob);
        Auth memory a = _auth(ALICE_PK, address(pot), 100 * USD + 2);
        vm.expectEmit(address(pot));
        emit KinPot.PotPaid(p, 0, 100 * USD + 2, b);
        vm.prank(alice);
        pot.contribute(p, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        // 100_000_002 / 3 = 33_333_334 r 0 -> exact; use a target with remainder below
        assertEq(ausd.balanceOf(carol) - c0, 33_333_334);
        assertEq(ausd.balanceOf(dave), 33_333_334);
        assertEq(ausd.balanceOf(bob) - b0, 33_333_334);

        vm.prank(alice);
        p = pot.create(b, false, uint96(100 * USD), _one(alice), address(0)); // 100_000_000 / 3 r 1
        c0 = ausd.balanceOf(carol);
        b0 = ausd.balanceOf(bob);
        uint256 d0 = ausd.balanceOf(dave);
        _contributeTo(ALICE_PK, p, 100 * USD);
        assertEq(ausd.balanceOf(carol) - c0, 33_333_334); // first gets the extra unit
        assertEq(ausd.balanceOf(dave) - d0, 33_333_333);
        assertEq(ausd.balanceOf(bob) - b0, 33_333_333);
        assertEq(ausd.balanceOf(address(pot)), 0); // sum conservation
    }

    function test_ToAllIncludesLinkJoiner() public {
        address[] memory m = new address[](2);
        (m[0], m[1]) = (alice, bob);
        vm.prank(alice);
        uint256 p = pot.create(_none(), true, uint96(90 * USD), m, vm.addr(KEY_PK));
        pot.join(p, alice, carol, _joinSig(KEY_PK, p, alice, carol));
        assertEq(pot.beneficiariesOf(p).length, 3);
        uint256 a0 = ausd.balanceOf(alice);
        uint256 b0 = ausd.balanceOf(bob);
        uint256 c0 = ausd.balanceOf(carol);
        _contributeTo(BOB_PK, p, 100 * USD); // pays 90, keeps 10
        assertEq(ausd.balanceOf(alice) - a0, 30 * USD);
        assertEq(ausd.balanceOf(bob) + 100 * USD - b0, 30 * USD);
        assertEq(ausd.balanceOf(carol) - c0, 30 * USD);
        assertEq(ausd.balanceOf(address(pot)), 10 * USD);
    }

    function test_CloseSplitsAndToAllMemberMayClose() public {
        address[] memory m = new address[](2);
        (m[0], m[1]) = (alice, bob);
        vm.prank(alice);
        uint256 p = pot.create(_none(), true, uint96(100 * USD), m, address(0));
        _contributeTo(ALICE_PK, p, 5 * USD + 1);
        vm.expectRevert(KinPot.Unauthorized.selector);
        vm.prank(carol); // not a member
        pot.close(p);
        uint256 a0 = ausd.balanceOf(alice);
        uint256 b0 = ausd.balanceOf(bob);
        vm.expectEmit(address(pot));
        emit KinPot.PotClosed(p, 5 * USD + 1, m);
        vm.prank(bob);
        pot.close(p);
        assertEq(ausd.balanceOf(alice) - a0, 2_500_001);
        assertEq(ausd.balanceOf(bob) - b0, 2_500_000);
        assertEq(ausd.balanceOf(address(pot)), 0);

        vm.expectRevert(KinPot.Unauthorized.selector);
        pot.close(999); // no such pot
    }

    function _contributeTo(uint256 pk, uint256 potId, uint256 value) internal {
        Auth memory a = _auth(pk, address(pot), value);
        vm.prank(vm.addr(pk));
        pot.contribute(potId, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }
}
