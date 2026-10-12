// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @notice Agora Instant Settlement pair (Uniswap-v2 router interface, fixed price, whitelisted swappers).
interface IAgoraStableSwapPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title KinCashout
/// @notice Cash-out through Agora Instant Settlement: pulls the user's signed AUSD, swaps it at Agora's fixed
///         price into the pair's other token (USDC on mainnet) and sends the output straight to `to` — the user's
///         own account or the off-ramp partner's deposit address, chosen and signed by the user. Nothing is ever
///         held here. One event per cash-out carries a salted payout reference (never the plain UPI ID).
///         This contract must be an approved swapper on the pair (Agora whitelist).
contract KinCashout is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    address public immutable ausd;
    IAgoraStableSwapPair public immutable pair;
    /// @notice The pair's non-AUSD token (what AUSD settles into).
    address public immutable settleToken;
    uint256 public count;

    event CashedOut(
        uint256 indexed id, address indexed user, address indexed to, uint256 ausdIn, uint256 settledOut, bytes32 payoutRef
    );

    error InvalidTerms();
    error PairMismatch();
    error ZeroMinOut();

    constructor(address forwarder, address ausd_, address pair_) ERC2771Context(forwarder) {
        address t0 = IAgoraStableSwapPair(pair_).token0();
        address t1 = IAgoraStableSwapPair(pair_).token1();
        if (t0 != ausd_ && t1 != ausd_) revert PairMismatch();
        ausd = ausd_;
        pair = IAgoraStableSwapPair(pair_);
        settleToken = t0 == ausd_ ? t1 : t0;
    }

    /// @notice Sell `value` AUSD at Agora's fixed price and send the output to `to`; reverts if the pair would
    ///         return less than `minOut`.
    function cashOut(
        address to,
        uint256 minOut,
        bytes32 payoutRef,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id, uint256 out) {
        if (value == 0 || payoutRef == bytes32(0) || to == address(0) || to == address(this)) revert InvalidTerms();
        if (minOut == 0) revert ZeroMinOut();
        address user = _msgSender();
        IERC3009(ausd).receiveWithAuthorization(user, address(this), value, validAfter, validBefore, nonce, signature);

        out = _swap(value, minOut, to);
        id = ++count;
        emit CashedOut(id, user, to, value, out, payoutRef);
    }

    /// @dev AUSD → settle token on the pair at Agora's fixed price, output straight to `to`.
    function _swap(uint256 value, uint256 minOut, address to) private returns (uint256) {
        IERC20(ausd).forceApprove(address(pair), value);
        address[] memory path = new address[](2);
        path[0] = ausd;
        path[1] = settleToken;
        return pair.swapExactTokensForTokens(value, minOut, path, to, block.timestamp)[1];
    }
}
