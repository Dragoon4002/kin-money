// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinGiftLink
/// @notice Dated gift sent as a link. Sender locks AUSD behind an ephemeral `claimKey` (lives in the link).
///         Whoever opens the link first `bind`s it to their account (claimKey sig naming them), after which the
///         link is useless to anyone else. On/after `unlockAt` anyone may `open` it → paid to the bound recipient.
///         Binding closes at `expiresAt`; after it the sender may `refund` if nobody bound it.
contract KinGiftLink is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Gift {
        address from;
        uint40 unlockAt;
        uint40 expiresAt;
        bool settled;
        address recipient;
        uint96 amount;
        address claimKey;
    }

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Gift) public gifts;

    event Created(uint256 indexed id, address indexed from, uint256 amount, uint40 unlockAt, uint40 expiresAt);
    event Bound(uint256 indexed id, address indexed recipient);
    event Opened(uint256 indexed id, address indexed recipient, uint256 amount);
    event Refunded(uint256 indexed id, address indexed from, uint256 amount);

    error InvalidAmount();
    error InvalidTerms();
    error Unauthorized();
    error NotReady();
    error AlreadyBound();
    error NotBound();
    error AlreadySettled();
    error NotExpired();
    error Expired();
    error BadSignature();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    /// @notice Lock `value` AUSD pulled from the caller via EIP-3009 ReceiveWithAuthorization (to = this). Ids start at 1.
    function create(
        address claimKey,
        uint40 unlockAt,
        uint40 expiresAt,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 id) {
        if (value == 0 || value > type(uint96).max) revert InvalidAmount();
        uint256 floor = unlockAt > block.timestamp ? unlockAt : block.timestamp;
        if (claimKey == address(0) || expiresAt <= floor) revert InvalidTerms();
        address from = _msgSender();
        id = ++count;
        gifts[id] = Gift(from, unlockAt, expiresAt, false, address(0), uint96(value), claimKey);
        emit Created(id, from, value, unlockAt, expiresAt);
        IERC3009(ausd).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Assign the gift to `recipient`. `signature` = claimKey's EIP-191 sig over
    ///         keccak256(abi.encode(address(this), block.chainid, id, recipient)). Anyone may submit.
    function bind(uint256 id, address recipient, bytes calldata signature) external {
        Gift storage g = gifts[id];
        if (g.claimKey == address(0) || recipient == address(0) || recipient == address(this) || recipient == ausd) {
            revert InvalidTerms();
        }
        if (g.settled) revert AlreadySettled();
        if (block.timestamp >= g.expiresAt) revert Expired(); // past expiry the sender may refund; no late binds
        if (g.recipient != address(0)) revert AlreadyBound();
        bytes32 digest =
            MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(address(this), block.chainid, id, recipient)));
        if (ECDSA.recover(digest, signature) != g.claimKey) revert BadSignature();
        g.recipient = recipient;
        emit Bound(id, recipient);
    }

    /// @notice Pay the bound recipient once the opening date has passed. Callable by anyone.
    function open(uint256 id) external nonReentrant {
        Gift storage g = gifts[id];
        if (g.recipient == address(0)) revert NotBound();
        if (g.settled) revert AlreadySettled();
        if (block.timestamp < g.unlockAt) revert NotReady();
        g.settled = true;
        emit Opened(id, g.recipient, g.amount);
        IERC20(ausd).safeTransfer(g.recipient, g.amount);
    }

    /// @notice Sender takes the gift back after expiry if nobody ever accepted it.
    ///         Once bound, the gift belongs to the recipient: it can only be opened (to them), never refunded.
    function refund(uint256 id) external nonReentrant {
        Gift storage g = gifts[id];
        if (_msgSender() != g.from) revert Unauthorized();
        if (g.settled) revert AlreadySettled();
        if (g.recipient != address(0)) revert AlreadyBound();
        if (block.timestamp < g.expiresAt) revert NotExpired();
        g.settled = true;
        emit Refunded(id, g.from, g.amount);
        IERC20(ausd).safeTransfer(g.from, g.amount);
    }
}
