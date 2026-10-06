// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {IAgoraStableSwapPair} from "./KinCashout.sol";

/// @notice Uniswap v4 surface used here (Currency = address, BalanceDelta = int256: amount0 << 128 | amount1).
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified; // negative = exact input
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @title KinCashoutV2
/// @notice Cash-out on any network without a forwarder: the user signs ONE EIP-3009 ReceiveWithAuthorization whose
///         nonce commits to every cash-out term (recipient, venue, min out, payout ref, salt). The relayer can submit
///         it but cannot change any term — a different term gives a different nonce and the signature fails.
///         AUSD is swapped into the settle token (USDC on mainnet) on the chosen venue and sent straight to `to`
///         (the user's own account or an off-ramp deposit address). Nothing is ever held here.
///         Venues: Agora Instant Settlement pair (fixed price; this contract must be an approved swapper) or a
///         Uniswap v4 pool (open to anyone). A venue set to address(0) at deploy is off on that network.
contract KinCashoutV2 is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum Venue {
        Agora,
        UniswapV4
    }

    // Uniswap v4 TickMath bounds + 1 / − 1: swap until filled (the exact-input check below rejects partial fills).
    uint160 private constant MIN_SQRT_PRICE_LIMIT = 4295128739 + 1;
    uint160 private constant MAX_SQRT_PRICE_LIMIT = 1461446703485210103287273052203988822378723970342 - 1;

    address public immutable ausd;
    /// @notice What AUSD settles into on both venues.
    address public immutable settleToken;
    IAgoraStableSwapPair public immutable agora;
    IPoolManager public immutable poolManager;
    uint24 public immutable poolFee;
    int24 public immutable poolTickSpacing;
    address public immutable poolHooks;
    uint256 public count;

    event CashedOut(
        uint256 indexed id,
        address indexed user,
        address indexed to,
        Venue venue,
        uint256 ausdIn,
        uint256 settledOut,
        bytes32 payoutRef
    );

    error InvalidTerms();
    error VenueOff();
    error PairMismatch();
    error NotPoolManager();
    error PartialFill();
    error InsufficientOutput();

    constructor(
        address ausd_,
        address settleToken_,
        address agora_,
        address poolManager_,
        uint24 poolFee_,
        int24 poolTickSpacing_,
        address poolHooks_
    ) {
        if (agora_ != address(0)) {
            address t0 = IAgoraStableSwapPair(agora_).token0();
            address t1 = IAgoraStableSwapPair(agora_).token1();
            if (!((t0 == ausd_ && t1 == settleToken_) || (t1 == ausd_ && t0 == settleToken_))) revert PairMismatch();
        }
        ausd = ausd_;
        settleToken = settleToken_;
        agora = IAgoraStableSwapPair(agora_);
        poolManager = IPoolManager(poolManager_);
        poolFee = poolFee_;
        poolTickSpacing = poolTickSpacing_;
        poolHooks = poolHooks_;
    }

    /// @notice Everything the user agrees to, committed to by the signed EIP-3009 nonce.
    struct Terms {
        address to;
        Venue venue;
        uint256 minOut;
        bytes32 payoutRef;
        bytes32 salt;
    }

    /// @notice The EIP-3009 nonce the user signs for these terms.
    function termsNonce(Terms calldata t) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), t.to, t.venue, t.minOut, t.payoutRef, t.salt));
    }

    /// @notice Sell `value` of `from`'s AUSD on `t.venue` and send the output to `t.to`; reverts below `t.minOut`.
    ///         Callable by anyone (the relayer): `from`'s signature over termsNonce(t) authorizes exactly this.
    function cashOut(
        address from,
        Terms calldata t,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id, uint256 out) {
        if (value == 0 || t.payoutRef == bytes32(0) || t.to == address(0) || t.to == address(this)) revert InvalidTerms();
        IERC3009(ausd).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, termsNonce(t), signature);
        out = t.venue == Venue.Agora ? _viaAgora(value, t.minOut, t.to) : _viaUniswap(value, t.minOut, t.to);
        id = ++count;
        emit CashedOut(id, from, t.to, t.venue, value, out, t.payoutRef);
    }

    function _viaAgora(uint256 value, uint256 minOut, address to) private returns (uint256) {
        if (address(agora) == address(0)) revert VenueOff();
        IERC20(ausd).forceApprove(address(agora), value);
        address[] memory path = new address[](2);
        (path[0], path[1]) = (ausd, settleToken);
        return agora.swapExactTokensForTokens(value, minOut, path, to, block.timestamp)[1];
    }

    function _viaUniswap(uint256 value, uint256 minOut, address to) private returns (uint256) {
        if (address(poolManager) == address(0)) revert VenueOff();
        return abi.decode(poolManager.unlock(abi.encode(value, minOut, to)), (uint256));
    }

    /// @dev Uniswap v4 flash accounting: swap exact `value` AUSD in, pay it, take the output to `to`.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint256 value, uint256 minOut, address to) = abi.decode(data, (uint256, uint256, address));
        bool zeroForOne = ausd < settleToken;
        PoolKey memory key = zeroForOne
            ? PoolKey(ausd, settleToken, poolFee, poolTickSpacing, poolHooks)
            : PoolKey(settleToken, ausd, poolFee, poolTickSpacing, poolHooks);
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

        poolManager.sync(ausd);
        IERC20(ausd).safeTransfer(address(poolManager), value);
        poolManager.settle();
        poolManager.take(settleToken, to, out);
        return abi.encode(out);
    }
}
