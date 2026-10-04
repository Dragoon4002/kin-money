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
/// @notice Cash-out through Agora Instant Settlement: pulls the user's signed AUSD and swaps it at Agora's fixed
///         price into the pair's other token, which this contract keeps as the payout desk's settlement inventory
///         (the off-ramp partner's side). One event per cash-out carries the payout reference so the payout leg
///         can be matched. `payoutRef` is a hash of the payout destination (e.g. a UPI ID), never the plain text.
///         This contract must be an approved swapper on the pair (Agora whitelist).
/// @dev ponytail: settlement tokens accumulate here with no withdraw (no admin by design). Fine for the practice
///      network pair (CTK); a real payout partner integration would forward them to the partner's deposit address.
contract KinCashout is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    address public immutable ausd;
    IAgoraStableSwapPair public immutable pair;
    /// @notice The pair's non-AUSD token (what AUSD settles into).
    address public immutable settleToken;
    uint256 public count;

    event CashedOut(uint256 indexed id, address indexed user, uint256 ausdIn, uint256 settledOut, bytes32 payoutRef);

    error InvalidTerms();
    error PairMismatch();

    constructor(address forwarder, address ausd_, address pair_) ERC2771Context(forwarder) {
        address t0 = IAgoraStableSwapPair(pair_).token0();
        address t1 = IAgoraStableSwapPair(pair_).token1();
        if (t0 != ausd_ && t1 != ausd_) revert PairMismatch();
        ausd = ausd_;
        pair = IAgoraStableSwapPair(pair_);
        settleToken = t0 == ausd_ ? t1 : t0;
    }

    /// @notice Sell `value` AUSD at Agora's fixed price; reverts if the pair would return less than `minOut`.
    function cashOut(
        uint256 minOut,
        bytes32 payoutRef,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id, uint256 out) {
        if (value == 0 || payoutRef == bytes32(0)) revert InvalidTerms();
        address user = _msgSender();
        IERC3009(ausd).receiveWithAuthorization(user, address(this), value, validAfter, validBefore, nonce, signature);

        IERC20(ausd).forceApprove(address(pair), value);
        address[] memory path = new address[](2);
        path[0] = ausd;
        path[1] = settleToken;
        out = pair.swapExactTokensForTokens(value, minOut, path, address(this), block.timestamp)[1];

        id = ++count;
        emit CashedOut(id, user, value, out, payoutRef);
    }
}
