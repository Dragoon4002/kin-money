// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KinTest} from "./KinTest.sol";
import {KinCashout} from "../src/KinCashout.sol";

contract MockSettle is ERC20 {
    constructor() ERC20("Constant Token", "CTK") {}

    function mint(address to, uint256 v) external {
        _mint(to, v);
    }
}

/// @notice Agora Instant Settlement stand-in: fixed 1:1 price (6 → 18 decimals), approved swappers only.
contract MockStablePair {
    address public token0;
    address public token1;
    mapping(address => bool) public approved;

    error InsufficientOutputAmount();
    error NotApproved();

    constructor(address t0, address t1) {
        (token0, token1) = (t0, t1);
    }

    function setApprovedSwapper(address a) external {
        approved[a] = true;
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        if (!approved[msg.sender]) revert NotApproved();
        uint256 out = amountIn * 1e12;
        if (out < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).transfer(to, out);
        amounts = new uint256[](2);
        (amounts[0], amounts[1]) = (amountIn, out);
    }
}

contract KinCashoutTest is KinTest {
    KinCashout cash;
    MockSettle ctk;
    MockStablePair pair;
    bytes32 constant REF = keccak256("upi:alice@okbank");

    function setUp() public override {
        super.setUp();
        ctk = new MockSettle();
        pair = new MockStablePair(address(ctk), address(ausd));
        ctk.mint(address(pair), 1_000_000e18);
        cash = new KinCashout(address(fwd), address(ausd), address(pair));
        pair.setApprovedSwapper(address(cash));
    }

    function _cashOut(uint256 pk, uint256 value, uint256 minOut, bytes32 ref) internal {
        Auth memory a = _auth(pk, address(cash), value);
        _forward(
            pk,
            address(cash),
            abi.encodeCall(KinCashout.cashOut, (minOut, ref, a.value, a.validAfter, a.validBefore, a.nonce, a.sig))
        );
    }

    function test_SettleTokenIsPairOtherSide() public view {
        assertEq(cash.settleToken(), address(ctk));
    }

    function test_CashOutViaForwarderSwapsAtFixedPrice() public {
        vm.expectEmit(address(cash));
        emit KinCashout.CashedOut(1, alice, 25 * USD, 25e18, REF);
        _cashOut(ALICE_PK, 25 * USD, 25e18, REF);
        assertEq(ausd.balanceOf(alice), 975 * USD);
        assertEq(ausd.balanceOf(address(pair)), 25 * USD);
        assertEq(ctk.balanceOf(address(cash)), 25e18);
        assertEq(ausd.balanceOf(address(cash)), 0);
        assertEq(cash.count(), 1);
    }

    function test_RevertsBelowMinOut() public {
        Auth memory a = _auth(ALICE_PK, address(cash), 10 * USD);
        vm.expectRevert(MockStablePair.InsufficientOutputAmount.selector);
        vm.prank(alice);
        cash.cashOut(10e18 + 1, REF, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_RevertsZeroValueOrRef() public {
        Auth memory a = _auth(ALICE_PK, address(cash), 10 * USD);
        vm.startPrank(alice);
        vm.expectRevert(KinCashout.InvalidTerms.selector);
        cash.cashOut(0, REF, 0, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.expectRevert(KinCashout.InvalidTerms.selector);
        cash.cashOut(0, bytes32(0), a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
        vm.stopPrank();
    }

    function test_RevertsWhenNotApprovedSwapper() public {
        KinCashout other = new KinCashout(address(fwd), address(ausd), address(pair));
        Auth memory a = _auth(ALICE_PK, address(other), 10 * USD);
        vm.expectRevert(MockStablePair.NotApproved.selector);
        vm.prank(alice);
        other.cashOut(0, REF, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_RevertsAuthForSomeoneElse() public {
        // Bob cannot spend Alice's signed authorization: receiveWithAuthorization binds `from` to the caller.
        Auth memory a = _auth(ALICE_PK, address(cash), 10 * USD);
        vm.expectRevert();
        vm.prank(bob);
        cash.cashOut(0, REF, a.value, a.validAfter, a.validBefore, a.nonce, a.sig);
    }

    function test_ConstructorRejectsPairWithoutAusd() public {
        MockStablePair bad = new MockStablePair(address(ctk), address(0xBAD));
        vm.expectRevert(KinCashout.PairMismatch.selector);
        new KinCashout(address(fwd), address(ausd), address(bad));
    }
}

/// @notice Against the live Agora Instant Settlement pair on Monad testnet. Runs only on a testnet fork:
///         forge test --fork-url https://testnet-rpc.monad.xyz --match-contract KinCashoutForkTest
contract KinCashoutForkTest is KinTest {
    address constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address constant PAIR = 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae;
    address constant WHITELISTER = 0x7c10F56d6f04a51376393a1C3670e966863F6BD5;
    address constant FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;

    function setUp() public override {}

    function test_ForkCashOutOnAgoraPair() public {
        if (block.chainid != 10143) return;
        KinCashout cash = new KinCashout(address(0xF0), AUSD, PAIR);
        (bool ok,) = WHITELISTER.call(abi.encodeWithSignature("setApprovedSwapper(address)", address(cash)));
        assertTrue(ok);
        // AUSD storage is custom (deal can't write it): use Agora's testnet faucet, then keep exactly 10.
        (ok,) = FAUCET.call(abi.encodeWithSignature("requestFunds(address)", alice));
        assertTrue(ok);
        uint256 extra = IERC20(AUSD).balanceOf(alice) - 10 * USD;
        vm.prank(alice);
        IERC20(AUSD).transfer(bob, extra);

        bytes32 nonce = keccak256("fork");
        uint256 before = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                ),
                alice,
                address(cash),
                10 * USD,
                0,
                before,
                nonce
            )
        );
        bytes memory sig = _sign(ALICE_PK, keccak256(abi.encodePacked("\x19\x01", _domain("Agora Dollar", AUSD), structHash)));
        vm.prank(alice);
        (uint256 id, uint256 out) = cash.cashOut(9e18, keccak256("upi:test"), 10 * USD, 0, before, nonce, sig);
        assertEq(id, 1);
        assertGe(out, 9e18);
        assertEq(IERC20(cash.settleToken()).balanceOf(address(cash)), out);
        assertEq(IERC20(AUSD).balanceOf(alice), 0);
    }
}
