// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinStream
/// @notice Linear per-second AUSD stream (allowance / salary). Vested = amount * elapsed / duration,
///         so the rate is amount/duration and any rounding dust is paid at `end`.
///         Payer may cancel: vested-but-unwithdrawn -> payee, unvested -> payer.
contract KinStream is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Stream {
        address payer;
        uint40 start;
        uint40 end;
        address payee;
        uint96 amount;
        uint96 withdrawn;
    }

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Stream) public streams;

    event StreamCreated(
        uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, uint40 start, uint40 end
    );
    event Withdrawn(uint256 indexed id, address indexed payee, uint256 amount);
    event Cancelled(uint256 indexed id, uint256 toPayee, uint256 toPayer);

    error InvalidTerms();
    error Unauthorized();
    error NothingToWithdraw();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    /// @notice Stream `value` AUSD to `payee` over `duration` seconds starting now.
    function create(
        address payee,
        uint40 duration,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id) {
        if (payee == address(0) || duration == 0 || value == 0 || value > type(uint96).max) revert InvalidTerms();
        address payer = _msgSender();
        uint40 start = uint40(block.timestamp);
        id = ++count;
        streams[id] = Stream(payer, start, start + duration, payee, uint96(value), 0);
        emit StreamCreated(id, payer, payee, value, start, start + duration);
        IERC3009(ausd).receiveWithAuthorization(payer, address(this), value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Withdrawable now by the payee.
    function accrued(uint256 id) public view returns (uint256) {
        Stream storage s = streams[id];
        return _vested(s) - s.withdrawn;
    }

    /// @notice Payee pulls everything accrued.
    function withdraw(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (_msgSender() != s.payee) revert Unauthorized();
        uint256 amt = accrued(id);
        if (amt == 0) revert NothingToWithdraw();
        s.withdrawn += uint96(amt);
        emit Withdrawn(id, s.payee, amt);
        IERC20(ausd).safeTransfer(s.payee, amt);
    }

    /// @notice Payer stops the stream: accrued -> payee, remainder -> payer. Stream is closed after.
    function cancel(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (_msgSender() != s.payer) revert Unauthorized();
        if (s.withdrawn == s.amount) revert NothingToWithdraw();
        uint96 vested = uint96(_vested(s));
        uint256 toPayee = vested - s.withdrawn;
        uint256 toPayer = s.amount - vested;
        (s.amount, s.withdrawn, s.end) = (vested, vested, uint40(block.timestamp));
        emit Cancelled(id, toPayee, toPayer);
        if (toPayee != 0) IERC20(ausd).safeTransfer(s.payee, toPayee);
        if (toPayer != 0) IERC20(ausd).safeTransfer(s.payer, toPayer);
    }

    function _vested(Stream storage s) private view returns (uint256) {
        if (block.timestamp >= s.end) return s.amount;
        return uint256(s.amount) * (block.timestamp - s.start) / (s.end - s.start);
    }
}
