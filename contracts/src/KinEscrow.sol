// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinEscrow
/// @notice Generic conditional AUSD lock. One primitive covers:
///  - claim link:       to = 0, claimKey = ephemeral address; `claim` with claimKey's sig naming the recipient.
///  - earmark:          to = payee, approver = family member who must OK it.
///  - emergency reserve: to = kid, approver = parent; kid `ping`s, parent `approve`s (auto-releases).
///  - gift:             unlockAt = date, optional approver.
///  - invoice milestone: approver = client, autoApproveAt = silent-release time.
/// Release condition: now >= unlockAt && (approver == 0 || approved || (autoApproveAt != 0 && now >= autoApproveAt)).
/// Refund: only `from`, only if expiresAt != 0 && now >= expiresAt. Every escrow settles exactly once.
/// Claim-link and approver escrows must set expiresAt > unlockAt. `to` may not be this contract or AUSD.
contract KinEscrow is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Escrow {
        address from;
        uint40 unlockAt;
        uint40 expiresAt;
        bool approved;
        bool settled;
        address to;
        uint40 autoApproveAt;
        address approver;
        uint96 amount;
        address claimKey;
    }

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Escrow) public escrows;

    event Created(uint256 indexed id, address indexed from, address indexed to, address approver, uint256 amount);
    event Approved(uint256 indexed id, address indexed approver);
    event Requested(uint256 indexed id, address indexed by);
    event Released(uint256 indexed id, address indexed to, uint256 amount);
    event Refunded(uint256 indexed id, address indexed from, uint256 amount);

    error InvalidAmount();
    error InvalidTerms();
    error Unauthorized();
    error NotReady();
    error AlreadySettled();
    error NotExpired();
    error BadSignature();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    /// @notice Lock `value` AUSD pulled from the caller via EIP-3009 ReceiveWithAuthorization (to = this).
    /// @dev Exactly one of `to` / `claimKey` must be set. Ids start at 1.
    function create(
        address to,
        address claimKey,
        address approver,
        uint40 unlockAt,
        uint40 expiresAt,
        uint40 autoApproveAt,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id) {
        if (value == 0 || value > type(uint96).max) revert InvalidAmount();
        if ((to == address(0)) == (claimKey == address(0)) || to == address(this) || to == ausd) revert InvalidTerms();
        // conditional escrows need an exit if the condition never happens
        if ((claimKey != address(0) || approver != address(0)) && (expiresAt == 0 || expiresAt <= unlockAt)) {
            revert InvalidTerms();
        }
        address from = _msgSender();
        id = ++count;
        escrows[id] = Escrow(from, unlockAt, expiresAt, false, false, to, autoApproveAt, approver, uint96(value), claimKey);
        emit Created(id, from, to, approver, value);
        IERC3009(ausd).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Pay `to` once conditions hold. Callable by anyone.
    function release(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.to == address(0)) revert InvalidTerms();
        _settle(id, e, e.to);
    }

    /// @notice Claim-link payout. `signature` = claimKey's EIP-191 sig over
    ///         keccak256(abi.encode(address(this), block.chainid, id, recipient)). Anyone may submit.
    function claim(uint256 id, address recipient, bytes calldata signature) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.claimKey == address(0) || recipient == address(0)) revert InvalidTerms();
        bytes32 digest =
            MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(address(this), block.chainid, id, recipient)));
        if (ECDSA.recover(digest, signature) != e.claimKey) revert BadSignature();
        _settle(id, e, recipient);
    }

    /// @notice Approver OKs the payout; releases immediately if already unlocked and `to` is set.
    function approve(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        address sender = _msgSender();
        if (sender != e.approver || sender == address(0)) revert Unauthorized();
        if (e.settled) revert AlreadySettled();
        e.approved = true;
        emit Approved(id, sender);
        if (e.to != address(0) && block.timestamp >= e.unlockAt) _settle(id, e, e.to);
    }

    /// @notice Payee asks the approver to release (emergency reserve). Event only.
    function ping(uint256 id) external {
        Escrow storage e = escrows[id];
        address sender = _msgSender();
        if (sender != e.to || sender == address(0)) revert Unauthorized();
        if (e.settled) revert AlreadySettled();
        emit Requested(id, sender);
    }

    /// @notice Sender reclaims after expiry if not yet settled.
    function refund(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (_msgSender() != e.from) revert Unauthorized();
        if (e.settled) revert AlreadySettled();
        if (e.expiresAt == 0 || block.timestamp < e.expiresAt) revert NotExpired();
        e.settled = true;
        emit Refunded(id, e.from, e.amount);
        IERC20(ausd).safeTransfer(e.from, e.amount);
    }

    function _settle(uint256 id, Escrow storage e, address recipient) private {
        if (e.settled) revert AlreadySettled();
        if (
            block.timestamp < e.unlockAt
                || !(e.approver == address(0) || e.approved
                    || (e.autoApproveAt != 0 && block.timestamp >= e.autoApproveAt))
        ) revert NotReady();
        e.settled = true;
        emit Released(id, recipient, e.amount);
        IERC20(ausd).safeTransfer(recipient, e.amount);
    }
}
