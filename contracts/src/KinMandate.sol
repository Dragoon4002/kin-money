// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinMandate
/// @notice Pre-funded AutoPay / scheduled sends. Payer locks `amount * periods` up front; payment k
///         (1..periods) falls due at `start + k * period`. Anyone may `collect` due payments to the payee.
///         Payer may `cancel`: due-but-unpaid -> payee, not-yet-due -> payer. Mandate is closed after.
contract KinMandate is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Mandate {
        address payer;
        uint40 start;
        uint32 period;
        uint16 periods; // total payments; shrinks to `paid` on cancel
        address payee;
        uint80 amount; // per payment
        uint16 paid;
    }

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Mandate) public mandates;

    event MandateCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint32 period,
        uint16 periods,
        uint40 start
    );
    event Collected(uint256 indexed id, address indexed payee, uint16 payments, uint256 total);
    event Cancelled(uint256 indexed id, address indexed payer, uint256 toPayee, uint256 toPayer);

    error InvalidTerms();
    error Unauthorized();
    error NothingDue();
    error Finished();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    /// @notice Pay `payee` `amount` every `period` seconds, `periods` times, first one `period` from now.
    ///         `value` must equal `amount * periods`; pulled via EIP-3009 ReceiveWithAuthorization.
    function create(
        address payee,
        uint80 amount,
        uint32 period,
        uint16 periods,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id) {
        if (
            payee == address(0) || payee == address(this) || payee == ausd || amount == 0 || period == 0
                || periods == 0 || value != uint256(amount) * periods
        ) revert InvalidTerms();
        address payer = _msgSender();
        uint40 start = uint40(block.timestamp);
        id = ++count;
        mandates[id] = Mandate(payer, start, period, periods, payee, amount, 0);
        emit MandateCreated(id, payer, payee, amount, period, periods, start);
        IERC3009(ausd).receiveWithAuthorization(payer, address(this), value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Number of payments due now and not yet paid.
    function due(uint256 id) public view returns (uint16) {
        Mandate storage m = mandates[id];
        if (m.period == 0) return 0;
        uint256 elapsed = (block.timestamp - m.start) / m.period;
        return uint16((elapsed < m.periods ? elapsed : m.periods) - m.paid);
    }

    /// @notice Pay out every due payment to the payee. Callable by anyone.
    function collect(uint256 id) external nonReentrant {
        Mandate storage m = mandates[id];
        uint16 n = due(id);
        if (n == 0) revert NothingDue();
        m.paid += n;
        uint256 total = uint256(m.amount) * n;
        emit Collected(id, m.payee, n, total);
        IERC20(ausd).safeTransfer(m.payee, total);
    }

    /// @notice Payer stops AutoPay: due payments -> payee, the rest -> payer.
    function cancel(uint256 id) external nonReentrant {
        Mandate storage m = mandates[id];
        if (_msgSender() != m.payer) revert Unauthorized();
        if (m.paid == m.periods) revert Finished();
        uint16 n = due(id);
        uint256 toPayee = uint256(m.amount) * n;
        uint256 toPayer = uint256(m.amount) * (m.periods - m.paid - n);
        m.paid += n;
        m.periods = m.paid;
        emit Cancelled(id, m.payer, toPayee, toPayer);
        if (toPayee != 0) IERC20(ausd).safeTransfer(m.payee, toPayee);
        if (toPayer != 0) IERC20(ausd).safeTransfer(m.payer, toPayer);
    }
}
