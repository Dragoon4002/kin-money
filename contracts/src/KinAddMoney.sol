// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {PoolKey, SwapParams, IPoolManager} from "./KinCashoutV2.sol";

/// @title KinAddMoney
/// @notice Mirror of KinCashoutV2's Uniswap venue: USDC that arrived from another chain becomes AUSD, gaslessly.
///         The user signs ONE EIP-3009 ReceiveWithAuthorization on USDC whose nonce commits to (to, minOut, salt);
///         the relayer submits it but cannot change any term. USDC is swapped to AUSD on the Uniswap v4 pool and
///         sent straight to `to`. Nothing is ever held here. No forwarder, no admin.
contract KinAddMoney is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // Uniswap v4 TickMath bounds + 1 / − 1: swap until filled (the exact-input check rejects partial fills).
    uint160 private constant MIN_SQRT_PRICE_LIMIT = 4295128739 + 1;
    uint160 private constant MAX_SQRT_PRICE_LIMIT = 1461446703485210103287273052203988822378723970342 - 1;

    address public immutable usdc;
    address public immutable ausd;
    IPoolManager public immutable poolManager;
    uint24 public immutable poolFee;
    int24 public immutable poolTickSpacing;
    address public immutable poolHooks;

    event MoneyAdded(address indexed from, address indexed to, uint256 usdcIn, uint256 ausdOut);

    error InvalidTerms();
    error NotPoolManager();
    error PartialFill();
    error InsufficientOutput();
    error ZeroMinOut();

    /// @notice Everything the user agrees to, committed to by the signed EIP-3009 nonce.
    struct Terms {
        address to;
        uint256 minOut;
        bytes32 salt;
    }

    constructor(
        address usdc_,
        address ausd_,
        address poolManager_,
        uint24 poolFee_,
        int24 poolTickSpacing_,
        address poolHooks_
    ) {
        usdc = usdc_;
        ausd = ausd_;
        poolManager = IPoolManager(poolManager_);
        poolFee = poolFee_;
        poolTickSpacing = poolTickSpacing_;
        poolHooks = poolHooks_;
    }

    /// @notice The EIP-3009 nonce the user signs for these terms.
    function termsNonce(Terms calldata t) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), t.to, t.minOut, t.salt));
    }

    /// @notice Swap `value` of `from`'s USDC to AUSD and send it to `t.to`; reverts below `t.minOut`.
    ///         Callable by anyone (the relayer): `from`'s signature over termsNonce(t) authorizes exactly this.
    function addMoney(
        address from,
        Terms calldata t,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata signature
    ) external nonReentrant returns (uint256 out) {
        if (value == 0 || t.to == address(0) || t.to == address(this)) revert InvalidTerms();
        if (t.minOut == 0) revert ZeroMinOut(); // open pool: no slippage floor = sandwich
        IERC3009(usdc).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, termsNonce(t), signature);
        out = abi.decode(poolManager.unlock(abi.encode(value, t.minOut, t.to)), (uint256));
        emit MoneyAdded(from, t.to, value, out);
    }

    /// @dev Uniswap v4 flash accounting: swap exact `value` USDC in, pay it, take the AUSD out to `to`.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint256 value, uint256 minOut, address to) = abi.decode(data, (uint256, uint256, address));
        bool zeroForOne = usdc < ausd;
        PoolKey memory key = zeroForOne
            ? PoolKey(usdc, ausd, poolFee, poolTickSpacing, poolHooks)
            : PoolKey(ausd, usdc, poolFee, poolTickSpacing, poolHooks);
        int256 delta = poolManager.swap(
            key,
            SwapParams(zeroForOne, -SafeCast.toInt256(value), zeroForOne ? MIN_SQRT_PRICE_LIMIT : MAX_SQRT_PRICE_LIMIT),
            ""
        );
        (int128 d0, int128 d1) = (int128(delta >> 128), int128(delta));
        (int128 paid, int128 got) = zeroForOne ? (d0, d1) : (d1, d0);
        if (uint256(uint128(-paid)) != value) revert PartialFill();
        uint256 out = uint256(uint128(got));
        if (out < minOut) revert InsufficientOutput();

        poolManager.sync(usdc);
        IERC20(usdc).safeTransfer(address(poolManager), value);
        poolManager.settle();
        poolManager.take(ausd, to, out);
        return abi.encode(out);
    }
}
