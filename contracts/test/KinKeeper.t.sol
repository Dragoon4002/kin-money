// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinKeeper} from "../src/KinKeeper.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {KinMandate} from "../src/KinMandate.sol";
import {KinGiftLink} from "../src/KinGiftLink.sol";
import {KinCircle} from "../src/KinCircle.sol";
import {KinEscrow} from "../src/KinEscrow.sol";

contract KinKeeperTest is KinTest {
    KinMandate mandate;
    KinGiftLink gl;
    KinCircle circle;
    KinEscrow escrow;
    KinKeeper keeper;
    address cre = makeAddr("creForwarder");
    uint256 constant KEY_PK = 0x6157;
    uint256 t0;
    uint256 mId;
    uint256 gId;
    uint256 cId;
    uint256 eId;

    function setUp() public override {
        super.setUp();
        t0 = block.timestamp;
        mandate = new KinMandate(address(fwd), address(ausd));
        gl = new KinGiftLink(address(fwd), address(ausd));
        circle = new KinCircle(address(fwd), address(ausd));
        escrow = new KinEscrow(address(fwd), address(ausd));
        keeper = new KinKeeper(cre, address(mandate), address(gl), address(circle), address(escrow));

        // AutoPay alice -> bob, 100/month x2
        Auth memory a = _auth(ALICE_PK, address(mandate), 200 * USD);
        vm.prank(alice);
        mId = mandate.create(bob, uint80(100 * USD), 30 days, 2, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);

        // Gift alice -> bob (bound), opens in 7 days
        a = _auth(ALICE_PK, address(gl), 50 * USD);
        vm.prank(alice);
        gId = gl.create(
            vm.addr(KEY_PK),
            uint40(t0 + 7 days),
            uint40(t0 + 60 days),
            a.value,
            a.validAfter,
            a.validBefore,
            a.nonce,
            a.sig
        );
        bytes memory bindSig = _sign(
            KEY_PK, MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(address(gl), block.chainid, gId, bob)))
        );
        gl.bind(gId, bob, bindSig);

        // Time-locked escrow alice -> carol, unlocks in 1 day
        a = _auth(ALICE_PK, address(escrow), 40 * USD);
        vm.prank(alice);
        eId = escrow.create(
            carol,
            address(0),
            address(0),
            uint40(t0 + 1 days),
            0,
            0,
            a.value,
            a.validAfter,
            a.validBefore,
            a.nonce,
            a.sig
        );

        // Circle of 3, all joined; round 0 pays alice
        address[] memory m = new address[](3);
        (m[0], m[1], m[2]) = (alice, bob, carol);
        vm.prank(alice);
        cId = circle.create(m, 3, uint96(10 * USD), 1 days);
        uint256[3] memory pks = [ALICE_PK, BOB_PK, CAROL_PK];
        for (uint256 i; i < 3; ++i) {
            address who = vm.addr(pks[i]);
            a = _auth(pks[i], address(circle), circle.depositFor(cId, who));
            vm.prank(who);
            circle.join(cId, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        }
    }

    function _ids(uint256 x) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = x;
    }

    function _report(
        bytes3[] memory codes,
        uint64[] memory values,
        uint256[] memory c,
        uint256[] memory o,
        uint256[] memory s,
        uint256[] memory r
    ) internal pure returns (bytes memory) {
        return abi.encode(codes, values, c, o, s, r);
    }

    function _noRates() internal pure returns (bytes3[] memory, uint64[] memory) {
        return (new bytes3[](0), new uint64[](0));
    }

    function test_OnlyForwarder() public {
        (bytes3[] memory c, uint64[] memory v) = _noRates();
        bytes memory rep = _report(c, v, _ids(mId), new uint256[](0), new uint256[](0), new uint256[](0));
        vm.warp(t0 + 30 days);
        vm.expectRevert(KinKeeper.NotForwarder.selector);
        vm.prank(alice);
        keeper.onReport("", rep);
        assertEq(mandate.due(mId), 1); // nothing ran
    }

    function test_RatesStored() public {
        bytes3[] memory c = new bytes3[](2);
        uint64[] memory v = new uint64[](2);
        (c[0], v[0]) = ("INR", 88_500_000);
        (c[1], v[1]) = ("PHP", 58_100_000);
        vm.expectEmit(address(keeper));
        emit KinKeeper.RateUpdated("INR", 88_500_000);
        vm.expectEmit(address(keeper));
        emit KinKeeper.RateUpdated("PHP", 58_100_000);
        vm.prank(cre);
        keeper.onReport("", _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0)));
        (uint64 val, uint40 at) = keeper.rateOf("INR");
        assertEq(val, 88_500_000);
        assertEq(at, block.timestamp);

        vm.warp(block.timestamp + 60);
        v[0] = 88_600_000;
        vm.prank(cre);
        keeper.onReport("", _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0)));
        (val, at) = keeper.rateOf("INR");
        assertEq(val, 88_600_000);
        assertEq(at, block.timestamp);
        (val,) = keeper.rateOf("AED");
        assertEq(val, 0);
    }

    function test_RatesMismatchAndZeroRevert() public {
        bytes3[] memory c = new bytes3[](2);
        uint64[] memory v = new uint64[](1);
        (c[0], c[1], v[0]) = ("INR", "PHP", 88_500_000);
        bytes memory rep = _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0));
        vm.expectRevert(KinKeeper.LengthMismatch.selector);
        vm.prank(cre);
        keeper.onReport("", rep);

        c = new bytes3[](1);
        (c[0], v[0]) = ("INR", 0);
        rep = _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0));
        vm.expectRevert(abi.encodeWithSelector(KinKeeper.ZeroRate.selector, bytes3("INR")));
        vm.prank(cre);
        keeper.onReport("", rep);
    }

    function _setInr(uint64 v0) internal {
        bytes3[] memory c = new bytes3[](1);
        uint64[] memory v = new uint64[](1);
        (c[0], v[0]) = ("INR", v0);
        vm.prank(cre);
        keeper.onReport("", _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0)));
    }

    /// @dev First set unbounded; after that each report may move a rate at most 15% either way.
    function test_RateJumpBounded() public {
        _setInr(88_000_000); // first set: any value
        _setInr(101_200_000); // +15% exactly: ok
        _setInr(86_020_000); // -15% exactly: ok

        bytes3[] memory c = new bytes3[](1);
        uint64[] memory v = new uint64[](1);
        (c[0], v[0]) = ("INR", 98_923_001); // +15% + 1
        bytes memory rep = _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0));
        vm.expectRevert(abi.encodeWithSelector(KinKeeper.RateJump.selector, bytes3("INR"), uint64(86_020_000), v[0]));
        vm.prank(cre);
        keeper.onReport("", rep);

        v[0] = 73_116_999; // -15% - 1
        rep = _report(c, v, new uint256[](0), new uint256[](0), new uint256[](0), new uint256[](0));
        vm.expectRevert(abi.encodeWithSelector(KinKeeper.RateJump.selector, bytes3("INR"), uint64(86_020_000), v[0]));
        vm.prank(cre);
        keeper.onReport("", rep);

        (uint64 val,) = keeper.rateOf("INR");
        assertEq(val, 86_020_000);
    }

    /// @dev 7 rates + one job of each kind; all four pay their payee, keeper keeps nothing.
    function test_AllJobsRun() public {
        for (uint256 i; i < 3; ++i) {
            uint256 pk = [ALICE_PK, BOB_PK, CAROL_PK][i];
            Auth memory a = _auth(pk, address(circle), 10 * USD);
            vm.prank(vm.addr(pk));
            circle.pay(cId, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        }
        vm.warp(t0 + 30 days);

        bytes3[] memory c = new bytes3[](7);
        uint64[] memory v = new uint64[](7);
        bytes3[7] memory codes = [bytes3("INR"), "PHP", "MXN", "AED", "EUR", "GBP", "NGN"];
        for (uint256 i; i < 7; ++i) {
            (c[i], v[i]) = (codes[i], uint64(1_000_000 * (i + 1)));
        }

        uint256 aliceBefore = ausd.balanceOf(alice);
        uint256 bobBefore = ausd.balanceOf(bob);
        uint256 carolBefore = ausd.balanceOf(carol);

        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(0, mId, true);
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(1, gId, true);
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(2, cId, true);
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(3, eId, true);
        bytes memory rep = _report(c, v, _ids(mId), _ids(gId), _ids(cId), _ids(eId));
        vm.prank(cre);
        uint256 g = gasleft();
        keeper.onReport("", rep);
        emit log_named_uint("onReport gas (7 rates + 4 jobs)", g - gasleft());

        assertEq(ausd.balanceOf(bob), bobBefore + 100 * USD + 50 * USD); // mandate + gift
        assertEq(ausd.balanceOf(carol), carolBefore + 40 * USD); // escrow
        assertEq(ausd.balanceOf(alice), aliceBefore + 30 * USD); // circle round 0 pot
        assertEq(ausd.balanceOf(address(keeper)), 0);
        (uint64 val,) = keeper.rateOf("NGN");
        assertEq(val, 7_000_000);
    }

    function test_FailingJobDoesNotBlockBatch() public {
        vm.warp(t0 + 30 days);
        uint256[] memory collects = new uint256[](2);
        (collects[0], collects[1]) = (mId, mId); // second is a double-collect -> NothingDue
        (bytes3[] memory c, uint64[] memory v) = _noRates();
        uint256 bobBefore = ausd.balanceOf(bob);

        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(0, mId, true);
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(0, mId, false);
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(1, 999, false); // unknown gift
        vm.expectEmit(address(keeper));
        emit KinKeeper.JobRun(3, eId, true);
        vm.prank(cre);
        keeper.onReport("", _report(c, v, collects, _ids(999), new uint256[](0), _ids(eId)));
        assertEq(ausd.balanceOf(bob), bobBefore + 100 * USD);
    }

    function test_SupportsInterface() public view {
        assertTrue(keeper.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(keeper.supportsInterface(type(IERC165).interfaceId));
        assertFalse(keeper.supportsInterface(0xffffffff));
    }
}
