// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KinTest} from "./KinTest.sol";
import {MockSettle, MockStablePair} from "./KinCashout.t.sol";
import {MockPoolManager} from "./MockPoolManager.sol";
import {KinCashoutV2} from "../src/KinCashoutV2.sol";

abstract contract CashoutV2Signing is KinTest {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    /// @dev Sign a ReceiveWithAuthorization to `cash` whose nonce commits to the cash-out terms.
    function _signTerms(
        uint256 pk,
        address token,
        KinCashoutV2 cash,
        KinCashoutV2.Terms memory t,
        uint256 value
    ) internal view returns (uint256 before, bytes memory sig) {
        before = block.timestamp + 1 hours;
        bytes32 nonce = cash.termsNonce(t);
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, vm.addr(pk), address(cash), value, 0, before, nonce));
        sig = _sign(pk, keccak256(abi.encodePacked("\x19\x01", _domain("Agora Dollar", token), structHash)));
    }
}

contract KinCashoutV2Test is CashoutV2Signing {
    KinCashoutV2 cash;
    MockSettle ctk;
    MockStablePair pair;
    bytes32 constant REF = keccak256("upi:alice@okbank");
    bytes32 constant SALT = keccak256("salt");
    address constant TO = address(0xD35C);
    KinCashoutV2.Venue constant AGORA = KinCashoutV2.Venue.Agora;
    KinCashoutV2.Venue constant UNI = KinCashoutV2.Venue.UniswapV4;

    function setUp() public override {
        super.setUp();
        ctk = new MockSettle();
        pair = new MockStablePair(address(ctk), address(ausd));
        ctk.mint(address(pair), 1_000_000e18);
        cash = new KinCashoutV2(address(ausd), address(ctk), address(pair), address(0), 0, 0, address(0));
        pair.setApprovedSwapper(address(cash));
    }

    function test_RelayerSubmitsSignedTermsViaAgora() public {
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), cash, KinCashoutV2.Terms(TO, AGORA, 25e18, REF, SALT), 25 * USD);
        vm.expectEmit(address(cash));
        emit KinCashoutV2.CashedOut(1, alice, TO, AGORA, 25 * USD, 25e18, REF);
        vm.prank(relayer);
        (uint256 id, uint256 out) = cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 25e18, REF, SALT), 25 * USD, 0, before, sig);
        assertEq(id, 1);
        assertEq(out, 25e18);
        assertEq(ausd.balanceOf(alice), 975 * USD);
        assertEq(ctk.balanceOf(TO), 25e18);
        assertEq(ausd.balanceOf(address(cash)), 0); // nothing held
        assertEq(ctk.balanceOf(address(cash)), 0);
    }

    function test_RelayerCannotChangeAnyTerm() public {
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), cash, KinCashoutV2.Terms(TO, AGORA, 25e18, REF, SALT), 25 * USD);
        vm.startPrank(relayer);
        vm.expectRevert(); // different recipient
        cash.cashOut(alice, KinCashoutV2.Terms(bob, AGORA, 25e18, REF, SALT), 25 * USD, 0, before, sig);
        vm.expectRevert(); // lower min out
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 25 * USD, 0, before, sig);
        vm.expectRevert(); // different venue
        cash.cashOut(alice, KinCashoutV2.Terms(TO, UNI, 25e18, REF, SALT), 25 * USD, 0, before, sig);
        vm.expectRevert(); // different payout ref
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 25e18, keccak256("other"), SALT), 25 * USD, 0, before, sig);
        vm.expectRevert(); // more money
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 25e18, REF, SALT), 26 * USD, 0, before, sig);
        vm.expectRevert(); // someone else's money
        cash.cashOut(bob, KinCashoutV2.Terms(TO, AGORA, 25e18, REF, SALT), 25 * USD, 0, before, sig);
        vm.stopPrank();
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_ReplayFails() public {
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), cash, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 10 * USD);
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 10 * USD, 0, before, sig);
        vm.expectRevert();
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 10 * USD, 0, before, sig);
        assertEq(ausd.balanceOf(alice), 990 * USD);
    }

    function test_RevertsBelowMinOut() public {
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), cash, KinCashoutV2.Terms(TO, AGORA, 10e18 + 1, REF, SALT), 10 * USD);
        vm.expectRevert(MockStablePair.InsufficientOutputAmount.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 10e18 + 1, REF, SALT), 10 * USD, 0, before, sig);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_UniswapVenueOffWhenNoPoolManager() public {
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), cash, KinCashoutV2.Terms(TO, UNI, 1, REF, SALT), 10 * USD);
        vm.expectRevert(KinCashoutV2.VenueOff.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(TO, UNI, 1, REF, SALT), 10 * USD, 0, before, sig);
    }

    function test_AgoraVenueOffWhenNoPair() public {
        KinCashoutV2 noPair = new KinCashoutV2(address(ausd), address(ctk), address(0), address(0), 0, 0, address(0));
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), noPair, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 10 * USD);
        vm.expectRevert(KinCashoutV2.VenueOff.selector);
        noPair.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 10 * USD, 0, before, sig);
    }

    function test_RevertsBadTerms() public {
        vm.expectRevert(KinCashoutV2.InvalidTerms.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, REF, SALT), 0, 0, 1, "");
        vm.expectRevert(KinCashoutV2.InvalidTerms.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(TO, AGORA, 0, bytes32(0), SALT), 1, 0, 1, "");
        vm.expectRevert(KinCashoutV2.InvalidTerms.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(address(0), AGORA, 0, REF, SALT), 1, 0, 1, "");
        vm.expectRevert(KinCashoutV2.InvalidTerms.selector);
        cash.cashOut(alice, KinCashoutV2.Terms(address(cash), AGORA, 0, REF, SALT), 1, 0, 1, "");
    }

    function test_OnlyPoolManagerCanCallBack() public {
        vm.expectRevert(KinCashoutV2.NotPoolManager.selector);
        cash.unlockCallback(abi.encode(uint256(1), uint256(0), TO));
    }

    /// @dev Uniswap-only cash-out whose settle token sits at `at` (below/above AUSD flips zeroForOne).
    function _uni(address at) internal returns (KinCashoutV2 c, MockSettle s, MockPoolManager pm) {
        deployCodeTo("KinCashout.t.sol:MockSettle", at);
        s = MockSettle(at);
        pm = new MockPoolManager();
        s.mint(address(pm), 1_000_000 * USD);
        c = new KinCashoutV2(address(ausd), at, address(0), address(pm), 50, 1, address(0));
    }

    /// @dev `err` != 0: expect that revert from cashOut (set after signing, which itself calls `c`).
    function _uniCashOut(KinCashoutV2 c, uint256 minOut, bytes4 err) internal returns (uint256 id, uint256 out) {
        KinCashoutV2.Terms memory t = KinCashoutV2.Terms(TO, UNI, minOut, REF, SALT);
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, address(ausd), c, t, 10 * USD);
        if (err != 0) vm.expectRevert(err);
        vm.prank(relayer);
        return c.cashOut(alice, t, 10 * USD, 0, before, sig);
    }

    function test_UniswapVenueEitherCurrencyOrder() public {
        address[2] memory spots = [address(0x10000), address(type(uint160).max - 0x10000)];
        for (uint256 i; i < 2; i++) {
            (KinCashoutV2 c, MockSettle s, MockPoolManager pm) = _uni(spots[i]);
            vm.expectEmit(address(c));
            emit KinCashoutV2.CashedOut(1, alice, TO, UNI, 10 * USD, 9_990_000, REF);
            (uint256 id, uint256 out) = _uniCashOut(c, 9_990_000, 0);
            assertEq(id, 1);
            assertEq(out, 9_990_000);
            assertEq(s.balanceOf(TO), 9_990_000);
            assertEq(ausd.balanceOf(address(pm)), 10 * USD);
            assertEq(ausd.balanceOf(address(c)), 0); // nothing held
            assertEq(s.balanceOf(address(c)), 0);
        }
        assertEq(ausd.balanceOf(alice), 980 * USD);
    }

    function test_UniswapBelowMinOutReverts() public {
        (KinCashoutV2 c,,) = _uni(address(0x10000));
        _uniCashOut(c, 9_990_001, KinCashoutV2.InsufficientOutput.selector);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_UniswapZeroMinOutReverts() public {
        (KinCashoutV2 c,,) = _uni(address(0x10000));
        _uniCashOut(c, 0, KinCashoutV2.ZeroMinOut.selector);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_UniswapPartialFillReverts() public {
        (KinCashoutV2 c,, MockPoolManager pm) = _uni(address(0x10000));
        pm.setFill(9_999);
        _uniCashOut(c, 1, KinCashoutV2.PartialFill.selector);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
    }

    function test_UniswapWrongDeltaReverts() public {
        (KinCashoutV2 c, MockSettle s, MockPoolManager pm) = _uni(address(0x10000));
        pm.setFlipDelta(true);
        _uniCashOut(c, 1, KinCashoutV2.PartialFill.selector);
        assertEq(ausd.balanceOf(alice), 1_000 * USD);
        assertEq(s.balanceOf(TO), 0);
    }

    function test_ConstructorRejectsWrongPair() public {
        vm.expectRevert(KinCashoutV2.PairMismatch.selector);
        new KinCashoutV2(address(ausd), address(0xBAD), address(pair), address(0), 0, 0, address(0));
    }
}

/// @notice Against the live Uniswap v4 AUSD/USDC pool on Monad mainnet:
///         forge test --fork-url https://rpc.monad.xyz --match-contract KinCashoutV2MainnetForkTest
contract KinCashoutV2MainnetForkTest is CashoutV2Signing {
    address constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant AGORA_PAIR = 0xf33286E3222D1c829dACeac48c0Ec651F6452470;
    address constant POOL_MANAGER = 0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e;

    function setUp() public override {}

    function test_ForkUniswapV4SwapToRecipient() public {
        vm.skip(block.chainid != 143);
        KinCashoutV2 cash = new KinCashoutV2(AUSD, USDC, AGORA_PAIR, POOL_MANAGER, 50, 1, address(0));
        vm.prank(AGORA_PAIR); // AUSD storage is custom (deal can't write it): borrow from a big holder
        IERC20(AUSD).transfer(alice, 10 * USD);

        address to = makeAddr("offramp-deposit");
        bytes32 ref = keccak256("upi:test");
        uint256 minOut = 9_990_000; // ≥ 0.999 USDC per AUSD
        (uint256 before, bytes memory sig) =
            _signTerms(ALICE_PK, AUSD, cash, KinCashoutV2.Terms(to, KinCashoutV2.Venue.UniswapV4, minOut, ref, bytes32("s")), 10 * USD);
        vm.prank(relayer);
        (uint256 id, uint256 out) =
            cash.cashOut(alice, KinCashoutV2.Terms(to, KinCashoutV2.Venue.UniswapV4, minOut, ref, bytes32("s")), 10 * USD, 0, before, sig);
        assertEq(id, 1);
        assertGe(out, minOut);
        assertEq(IERC20(USDC).balanceOf(to), out);
        assertEq(IERC20(AUSD).balanceOf(alice), 0);
        assertEq(IERC20(AUSD).balanceOf(address(cash)), 0);
        assertEq(IERC20(USDC).balanceOf(address(cash)), 0);
    }

    function test_ForkAgoraPairNeedsWhitelist() public {
        vm.skip(block.chainid != 143);
        KinCashoutV2 cash = new KinCashoutV2(AUSD, USDC, AGORA_PAIR, POOL_MANAGER, 50, 1, address(0));
        vm.prank(AGORA_PAIR);
        IERC20(AUSD).transfer(alice, 10 * USD);
        (uint256 before, bytes memory sig) =
            _signTerms(ALICE_PK, AUSD, cash, KinCashoutV2.Terms(alice, KinCashoutV2.Venue.Agora, 0, bytes32("r"), bytes32("s")), 10 * USD);
        vm.expectRevert(); // not an approved swapper until Agora whitelists the contract
        cash.cashOut(alice, KinCashoutV2.Terms(alice, KinCashoutV2.Venue.Agora, 0, bytes32("r"), bytes32("s")), 10 * USD, 0, before, sig);
    }
}

/// @notice Against the live Agora Instant Settlement pair on Monad testnet:
///         forge test --fork-url https://testnet-rpc.monad.xyz --match-contract KinCashoutV2TestnetForkTest
contract KinCashoutV2TestnetForkTest is CashoutV2Signing {
    address constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address constant PAIR = 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae;
    address constant WHITELISTER = 0x7c10F56d6f04a51376393a1C3670e966863F6BD5;
    address constant FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;

    function setUp() public override {}

    function test_ForkAgoraPairToRecipient() public {
        vm.skip(block.chainid != 10143);
        address t0 = MockStablePair(PAIR).token0();
        address settle = t0 == AUSD ? MockStablePair(PAIR).token1() : t0;
        KinCashoutV2 cash = new KinCashoutV2(AUSD, settle, PAIR, address(0), 0, 0, address(0));
        (bool ok,) = WHITELISTER.call(abi.encodeWithSignature("setApprovedSwapper(address)", address(cash)));
        assertTrue(ok);
        (ok,) = FAUCET.call(abi.encodeWithSignature("requestFunds(address)", alice));
        assertTrue(ok);
        uint256 extra = IERC20(AUSD).balanceOf(alice) - 10 * USD;
        vm.prank(alice);
        IERC20(AUSD).transfer(bob, extra);

        KinCashoutV2.Terms memory t = KinCashoutV2.Terms(carol, KinCashoutV2.Venue.Agora, 9e18, bytes32("r"), bytes32("s"));
        (uint256 before, bytes memory sig) = _signTerms(ALICE_PK, AUSD, cash, t, 10 * USD);
        vm.prank(relayer);
        (, uint256 out) = cash.cashOut(alice, t, 10 * USD, 0, before, sig);
        assertGe(out, 9e18);
        assertEq(IERC20(settle).balanceOf(carol), out);
        assertEq(IERC20(AUSD).balanceOf(alice), 0);
        assertEq(IERC20(settle).balanceOf(address(cash)), 0);
    }
}
