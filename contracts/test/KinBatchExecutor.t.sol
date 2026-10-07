// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Mock3009} from "./Mock3009.sol";
import {KinBatchExecutor} from "../src/KinBatchExecutor.sol";

/// @notice Stand-in for a deposit contract that pulls an approved token (Relay deposit step).
contract MockDepository {
    address public lastFrom;

    function deposit(IERC20 token, uint256 amount) external {
        lastFrom = msg.sender;
        token.transferFrom(msg.sender, address(this), amount);
    }
}

contract KinBatchExecutorTest is Test {
    KinBatchExecutor impl;
    Mock3009 token;
    MockDepository depo;
    uint256 constant USER_PK = 0xA11CE;
    address user = vm.addr(USER_PK);
    address relayer = makeAddr("relayer");

    function setUp() public {
        impl = new KinBatchExecutor();
        token = new Mock3009();
        depo = new MockDepository();
        token.mint(user, 100e6);
        vm.signAndAttachDelegation(address(impl), USER_PK); // user's EOA now runs KinBatchExecutor
    }

    function _calls(uint256 amount) internal view returns (KinBatchExecutor.Call[] memory c) {
        c = new KinBatchExecutor.Call[](2);
        c[0] = KinBatchExecutor.Call(address(token), 0, abi.encodeCall(IERC20.approve, (address(depo), amount)));
        c[1] = KinBatchExecutor.Call(address(depo), 0, abi.encodeCall(MockDepository.deposit, (IERC20(address(token)), amount)));
    }

    function _sign(uint256 pk, KinBatchExecutor.Call[] memory c, uint256 deadline) internal view returns (bytes memory) {
        bytes32 digest = KinBatchExecutor(payable(user)).batchDigest(c, KinBatchExecutor(payable(user)).nonce(), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_RelayerRunsApproveAndDepositAsUser() public {
        KinBatchExecutor.Call[] memory c = _calls(10e6);
        bytes memory sig = _sign(USER_PK, c, block.timestamp + 180);
        assertEq(user.balance, 0); // user holds no MON
        vm.prank(relayer);
        KinBatchExecutor(payable(user)).execute(c, block.timestamp + 180, sig);
        assertEq(depo.lastFrom(), user); // steps ran with the user's EOA as msg.sender
        assertEq(token.balanceOf(address(depo)), 10e6);
        assertEq(token.balanceOf(user), 90e6);
        assertEq(KinBatchExecutor(payable(user)).nonce(), 1);
    }

    function test_ReplayFails() public {
        KinBatchExecutor.Call[] memory c = _calls(10e6);
        uint256 deadline = block.timestamp + 180;
        bytes memory sig = _sign(USER_PK, c, deadline);
        KinBatchExecutor(payable(user)).execute(c, deadline, sig);
        vm.expectRevert(KinBatchExecutor.BadSignature.selector);
        KinBatchExecutor(payable(user)).execute(c, deadline, sig);
        assertEq(token.balanceOf(user), 90e6);
    }

    function test_OtherKeyCannotSpend() public {
        KinBatchExecutor.Call[] memory c = _calls(10e6);
        bytes memory sig = _sign(0xB0B, c, block.timestamp + 180);
        vm.expectRevert(KinBatchExecutor.BadSignature.selector);
        KinBatchExecutor(payable(user)).execute(c, block.timestamp + 180, sig);
    }

    function test_RelayerCannotChangeCalls() public {
        KinBatchExecutor.Call[] memory c = _calls(10e6);
        bytes memory sig = _sign(USER_PK, c, block.timestamp + 180);
        KinBatchExecutor.Call[] memory bigger = _calls(50e6);
        vm.expectRevert(KinBatchExecutor.BadSignature.selector);
        KinBatchExecutor(payable(user)).execute(bigger, block.timestamp + 180, sig);
    }

    function test_ExpiredFails() public {
        KinBatchExecutor.Call[] memory c = _calls(10e6);
        uint256 deadline = block.timestamp + 180;
        bytes memory sig = _sign(USER_PK, c, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(KinBatchExecutor.Expired.selector);
        KinBatchExecutor(payable(user)).execute(c, deadline, sig);
    }

    function test_FailedStepRevertsWholeBatch() public {
        KinBatchExecutor.Call[] memory c = _calls(1_000e6); // more than the user holds
        bytes memory sig = _sign(USER_PK, c, block.timestamp + 180);
        vm.expectRevert();
        KinBatchExecutor(payable(user)).execute(c, block.timestamp + 180, sig);
        assertEq(token.allowance(user, address(depo)), 0); // approve rolled back too
        assertEq(KinBatchExecutor(payable(user)).nonce(), 0);
    }

    function test_DelegatedAccountStillReceivesMon() public {
        vm.deal(relayer, 1 ether);
        vm.prank(relayer);
        (bool ok,) = user.call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(user.balance, 1 ether);
    }
}
