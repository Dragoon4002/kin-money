// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KinTest} from "./KinTest.sol";
import {Mock3009} from "./Mock3009.sol";
import {KinAddMoney} from "../src/KinAddMoney.sol";
import {PoolKey, SwapParams} from "../src/KinCashoutV2.sol";

/// @notice Uniswap v4 PoolManager stand-in: fixed rate (bps), exact-input swaps, sync/settle/take flash accounting.
contract MockPoolManager {
    uint256 public rateBps = 9_990;
    address synced;
    uint256 syncedBal;
    int256 owed; // input still to be paid in the current unlock

    function unlock(bytes calldata data) external returns (bytes memory r) {
        r = KinAddMoney(msg.sender).unlockCallback(data);
        require(owed == 0, "unsettled");
    }

    function swap(PoolKey memory key, SwapParams memory p, bytes calldata) external returns (int256) {
        require(key.currency0 < key.currency1 && p.amountSpecified < 0, "bad swap");
        int128 amtIn = int128(-p.amountSpecified);
        int128 amtOut = int128(int256(uint256(uint128(amtIn)) * rateBps / 10_000));
        owed += amtIn;
        (int128 d0, int128 d1) = p.zeroForOne ? (-amtIn, amtOut) : (amtOut, -amtIn);
        return (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }

    function sync(address c) external {
        (synced, syncedBal) = (c, IERC20(c).balanceOf(address(this)));
    }

    function settle() external payable returns (uint256 paid) {
        paid = IERC20(synced).balanceOf(address(this)) - syncedBal;
        owed -= int256(paid);
    }

    function take(address c, address to, uint256 amount) external {
        IERC20(c).transfer(to, amount);
    }
}

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
        add.addMoney(alice, KinAddMoney.Terms(TO, 0, SALT), 10 * USD, 0, before, sig);
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
        KinAddMoney.Terms memory t = KinAddMoney.Terms(TO, 0, SALT);
        (uint256 before, bytes memory sig) = _sig(t, 10 * USD);
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        vm.expectRevert("authorization is used");
        add.addMoney(alice, t, 10 * USD, 0, before, sig);
        assertEq(usdc.balanceOf(alice), 990 * USD);
    }

    function test_RevertsBadTerms() public {
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(TO, 0, SALT), 0, 0, 1, "");
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(address(0), 0, SALT), 1, 0, 1, "");
        vm.expectRevert(KinAddMoney.InvalidTerms.selector);
        add.addMoney(alice, KinAddMoney.Terms(address(add), 0, SALT), 1, 0, 1, "");
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
        if (block.chainid != 143) return;
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
