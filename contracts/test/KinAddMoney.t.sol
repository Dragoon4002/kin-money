// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KinTest} from "./KinTest.sol";
import {Mock3009} from "./Mock3009.sol";
import {KinAddMoney} from "../src/KinAddMoney.sol";
import {MockPoolManager} from "./MockPoolManager.sol";

abstract contract AddMoneySigning is KinTest {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    function _signAdd(uint256 pk, address token, string memory name, string memory version, KinAddMoney add, KinAddMoney.Terms memory t, uint256 value)
        internal
        view
        returns (uint256 before, bytes memory sig)
    {
        before = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, vm.addr(pk), address(add), value, 0, before, add.termsNonce(t)));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                token
            )
        );
        sig = _sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
    }
}

contract KinAddMoneyTest is AddMoneySigning {
    KinAddMoney add;
    Mock3009 usdc;
    MockPoolManager pm;
    address constant TO = address(0xD35C);
    bytes32 constant SALT = keccak256("salt");

    function setUp() public override {
        super.setUp();
        usdc = new Mock3009(); // stands in for Circle USDC (EIP-3009); KinTest's `ausd` is the output
        usdc.mint(alice, 1_000 * USD);
        pm = new MockPoolManager();
        ausd.mint(address(pm), 1_000_000 * USD);
        add = new KinAddMoney(address(usdc), address(ausd), address(pm), 50, 1, address(0));
    }

    function _sig(KinAddMoney.Terms memory t, uint256 value) internal view returns (uint256, bytes memory) {
        return _signAdd(ALICE_PK, address(usdc), "Agora Dollar", "1", add, t, value);
    }

    function test_RelayerAddsMoney() public {
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 9_990_000, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.expectEmit(address(add));
        emit KinAddMoney.MoneyAdded(alice, TO, 10 * USD, 9_990_000);
        vm.prank(relayer);
        uint256 out = add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(out, 9_990_000);
        assertEq(usdc.balanceOf(alice), 990 * USD);
        assertEq(ausd.balanceOf(TO), 9_990_000);
        assertEq(usdc.balanceOf(address(pm)), 10 * USD);
        assertEq(usdc.balanceOf(address(add)), 0); // nothing held
        assertEq(ausd.balanceOf(address(add)), 0);
    }

    function test_RevertsBelowMinOut() public {
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 9_990_001, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.expectRevert(KinAddMoney.InsufficientOutput.selector);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 1_000 * USD);
    }

    function test_RelayerCannotChangeAnyTerm() public {
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 9 * USD, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.startPrank(relayer);
        vm.expectRevert("invalid signature"); // different recipient
        add.addMoney(alice, KinAddMoney.Terms(bob, 9 * USD, SALT), 10 * USD, 0, before, sig);
        vm.expectRevert("invalid signature"); // lower min out
        add.addMoney(alice, KinAddMoney.Terms(TO, 1, SALT), 10 * USD, 0, before, sig);
        vm.expectRevert("invalid signature"); // different salt
        add.addMoney(alice, KinAddMoney.Terms(TO, 9 * USD, bytes32(0)), 10 * USD, 0, before, sig);
        vm.expectRevert("invalid signature"); // more money
        add.addMoney(alice, t, 11 * USD, 0, before, sig);
        vm.expectRevert("invalid signature"); // someone else's money
        add.addMoney(bob, t, 10 * USD, 0, before, sig);
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), 1_000 * USD);
    }

    function test_ReplayFails() public {
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 1, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        vm.expectRevert("authorization is used");
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 990 * USD);
    }

    function test_RevertsZeroMinOut() public {
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 0, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.expectRevert(KinAddMoney.ZeroMinOut.selector);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 1_000 * USD);
    }

    function test_RevertsBadTerms() public {
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(TO, 0, SALT), 0, 0, 1, "");
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(address(0), 0, SALT), 1, 0, 1, "");
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(address(add), 0, SALT), 1, 0, 1, "");
    }

    function test_PartialFillReverts() public {
        pm.setFill(9_999); // pool only takes part of the input
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 1, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.expectRevert(KinAddMoney.PartialFill.selector);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 1_000 * USD);
    }

    function test_WrongDeltaReverts() public {
        pm.setFlipDelta(true); // pool reports input/output in the wrong currency slots
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 1, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        vm.expectRevert(KinAddMoney.PartialFill.selector);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 1_000 * USD);
        assertEq(ausd.balanceOf(TO), 0);
    }

    /// @dev Both currency orders (zeroForOne true/false): USDC placed below and above AUSD.
    function test_AddsMoneyEitherCurrencyOrder() public {
        address[2] memory spots = [address(0x10000), address(type(uint160).max - 0x10000)];
        for (uint256 i; i < 2; i++) {
            deployCodeTo("Mock3009.sol:Mock3009", spots[i]);
            Mock3009 u = Mock3009(spots[i]);
            u.mint(alice, 10 * USD);
            KinAddMoney a = new KinAddMoney(address(u), address(ausd), address(pm), 50, 1, address(0));
            KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 9_990_000, SALT);
            (uint256 before, bytes memory sig) = _signAdd(ALICE_PK, address(u), "Agora Dollar", "1", a, t, 10 * USD);
            uint256 out = a.addMoney(alice, t, 10 * USD, 0, before, sig);
            assertEq(out, 9_990_000);
            assertEq(u.balanceOf(alice), 0);
            assertEq(u.balanceOf(address(pm)), 10 * USD);
        }
        assertEq(ausd.balanceOf(TO), 2 * 9_990_000);
    }

    function test_OnlyPoolManagerCanCallBack() public {
        vm.expectRevert(KinAddMoney.NotPoolManager.selector);
        add.unlockCallback(abi.encode(uint256(1), uint256(0), TO));
    }
}

/// @notice Against the live Uniswap v4 AUSD/USDC pool on Monad mainnet (skips on any other chain):
///         forge test --fork-url https://rpc.monad.xyz --match-contract KinAddMoneyMainnetForkTest
contract KinAddMoneyMainnetForkTest is AddMoneySigning {
    address constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant POOL_MANAGER = 0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e;

    function setUp() public override {}

    function test_ForkUsdcToAusdToRecipient() public {
        vm.skip(block.chainid != 143);
        KinAddMoney add = new KinAddMoney(USDC, AUSD, POOL_MANAGER, 50, 1, address(0));
        deal(USDC, alice, 10 * USD);

        address to = makeAddr("kin-user");
        KinAddMoney.Terms memory t = KinAddMoney.Terms(to, 9_990_000, bytes32("s")); // ≥ 0.999 AUSD per USDC
        (uint256 before, bytes memory sig) = _signAdd(ALICE_PK, USDC, "USDC", "2", add, t, 10 * USD);
        vm.prank(relayer);
        uint256 g = gasleft();
        uint256 out = add.addMoney(alice, t, 10 * USD, 0, before, sig);
        emit log_named_uint("addMoney gas", g - gasleft());
        assertGe(out, t.minOut);
        assertEq(IERC20(AUSD).balanceOf(to), out);
        assertEq(IERC20(USDC).balanceOf(alice), 0);
        assertEq(IERC20(USDC).balanceOf(address(add)), 0);
        assertEq(IERC20(AUSD).balanceOf(address(add)), 0);
    }
}
