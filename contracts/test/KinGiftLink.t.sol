// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinGiftLink} from "../src/KinGiftLink.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract KinGiftLinkTest is KinTest {
    KinGiftLink gl;
    uint256 constant KEY_PK = 0x6157;
    address key = vm.addr(KEY_PK);
    uint40 unlockAt;
    uint40 expiresAt;

    function setUp() public override {
        super.setUp();
        gl = new KinGiftLink(address(fwd), address(ausd));
        unlockAt = uint40(block.timestamp + 7 days);
        expiresAt = unlockAt + 60 days;
    }

    function _create(uint256 value) internal returns (uint256) {
        Auth memory a = _auth(ALICE_PK, address(gl), value);
        vm.prank(alice);
        return gl.create(key, unlockAt, expiresAt, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function _bindSig(uint256 pk, uint256 id, address recipient) internal view returns (bytes memory) {
        return _sign(
            pk,
            MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(address(gl), block.chainid, id, recipient)))
        );
    }

    function test_CreateBindOpenAfterDate() public {
        uint256 id = _create(50 * USD);
        assertEq(ausd.balanceOf(address(gl)), 50 * USD);
        vm.prank(relayer);
        gl.bind(id, bob, _bindSig(KEY_PK, id, bob));
        (,,,, address recipient,,) = gl.gifts(id);
        assertEq(recipient, bob);

        vm.warp(unlockAt);
        vm.prank(carol); // anyone may open; pays the bound recipient
        gl.open(id);
        assertEq(ausd.balanceOf(bob), 1_050 * USD);
        assertEq(ausd.balanceOf(address(gl)), 0);
        vm.expectRevert(KinGiftLink.AlreadySettled.selector);
        gl.open(id);
    }

    function test_OpenBeforeDateReverts() public {
        uint256 id = _create(50 * USD);
        vm.expectRevert(KinGiftLink.NotBound.selector);
        gl.open(id);
        gl.bind(id, bob, _bindSig(KEY_PK, id, bob));
        vm.warp(unlockAt - 1);
        vm.expectRevert(KinGiftLink.NotReady.selector);
        gl.open(id);
    }

    function test_BindTwiceReverts() public {
        uint256 id = _create(50 * USD);
        gl.bind(id, bob, _bindSig(KEY_PK, id, bob));
        bytes memory s = _bindSig(KEY_PK, id, carol);
        vm.expectRevert(KinGiftLink.AlreadyBound.selector);
        gl.bind(id, carol, s);
        bytes memory s2 = _bindSig(KEY_PK, id, bob);
        vm.expectRevert(KinGiftLink.AlreadyBound.selector);
        gl.bind(id, bob, s2);
    }

    function test_WrongKeyReverts() public {
        uint256 id = _create(50 * USD);
        bytes memory s = _bindSig(CAROL_PK, id, carol);
        vm.expectRevert(KinGiftLink.BadSignature.selector);
        gl.bind(id, carol, s);
    }

    function test_SigForOneRecipientCantBindAnother() public {
        uint256 id = _create(50 * USD);
        bytes memory s = _bindSig(KEY_PK, id, bob);
        vm.expectRevert(KinGiftLink.BadSignature.selector);
        gl.bind(id, carol, s); // front-runner swaps recipient
        gl.bind(id, bob, s);
    }

    function test_RefundBeforeAndAfterExpiry() public {
        uint256 id = _create(50 * USD);
        vm.warp(expiresAt - 1);
        vm.expectRevert(KinGiftLink.NotExpired.selector);
        vm.prank(alice);
        gl.refund(id);
        vm.warp(expiresAt);
        vm.expectRevert(KinGiftLink.Unauthorized.selector);
        vm.prank(bob);
        gl.refund(id);
        vm.prank(alice);
        gl.refund(id);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        bytes memory s = _bindSig(KEY_PK, id, bob);
        vm.expectRevert(KinGiftLink.AlreadySettled.selector);
        gl.bind(id, bob, s);
    }

    function test_BindAfterExpiryReverts() public {
        uint256 id = _create(50 * USD);
        bytes memory s = _bindSig(KEY_PK, id, bob);
        vm.warp(expiresAt);
        vm.expectRevert(KinGiftLink.Expired.selector); // can't front-run the sender's refund
        gl.bind(id, bob, s);
        vm.prank(alice);
        gl.refund(id);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_BindRejectsContractOrToken() public {
        uint256 id = _create(50 * USD);
        bytes memory s = _bindSig(KEY_PK, id, address(gl));
        vm.expectRevert(KinGiftLink.InvalidTerms.selector);
        gl.bind(id, address(gl), s);
        s = _bindSig(KEY_PK, id, address(ausd));
        vm.expectRevert(KinGiftLink.InvalidTerms.selector);
        gl.bind(id, address(ausd), s);
    }

    function test_BoundGiftCannotBeRefunded() public {
        uint256 id = _create(50 * USD);
        gl.bind(id, bob, _bindSig(KEY_PK, id, bob));
        vm.warp(expiresAt + 1);
        vm.expectRevert(KinGiftLink.AlreadyBound.selector);
        vm.prank(alice);
        gl.refund(id);
        uint256 before = ausd.balanceOf(bob);
        gl.open(id); // still opens to the recipient, even after expiry
        assertEq(ausd.balanceOf(bob), before + 50 * USD);
    }

    function test_RefundAfterOpenReverts() public {
        uint256 id = _create(50 * USD);
        gl.bind(id, bob, _bindSig(KEY_PK, id, bob));
        vm.warp(unlockAt);
        gl.open(id);
        vm.warp(expiresAt);
        vm.expectRevert(KinGiftLink.AlreadySettled.selector);
        vm.prank(alice);
        gl.refund(id);
    }

    function test_CreateRevertsBadTerms() public {
        Auth memory a = _auth(ALICE_PK, address(gl), 50 * USD);
        vm.startPrank(alice);
        vm.expectRevert(KinGiftLink.InvalidTerms.selector);
        gl.create(address(0), unlockAt, expiresAt, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinGiftLink.InvalidTerms.selector);
        gl.create(key, unlockAt, unlockAt, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinGiftLink.InvalidTerms.selector); // past unlock, expiry must still be in the future
        gl.create(key, 1, uint40(block.timestamp), a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinGiftLink.InvalidAmount.selector);
        gl.create(key, unlockAt, expiresAt, 0, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.stopPrank();
    }

    function test_ViaForwarder() public {
        Auth memory a = _auth(ALICE_PK, address(gl), 20 * USD);
        _forward(
            ALICE_PK,
            address(gl),
            abi.encodeCall(
                KinGiftLink.create, (key, unlockAt, expiresAt, a.value, a.validAfter, a.validBefore, a.nonce, a.sig)
            )
        );
        assertEq(gl.count(), 1);
        (address from,,,,,,) = gl.gifts(1);
        assertEq(from, alice);
        _forward(BOB_PK, address(gl), abi.encodeCall(KinGiftLink.bind, (1, bob, _bindSig(KEY_PK, 1, bob))));
        uint256 before = ausd.balanceOf(bob);
        vm.warp(unlockAt);
        _forward(ALICE_PK, address(gl), abi.encodeCall(KinGiftLink.open, (1))); // anyone may open → pays bob
        assertEq(ausd.balanceOf(bob), before + 20 * USD);
    }
}
