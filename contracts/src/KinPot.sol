// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinPot
/// @notice Shared family pot. Members chip in; whenever balance >= target, target (per full multiple) is split
///         equally between the recipients, round advances, excess carries over. Recipients = a fixed list of
///         1-20 beneficiaries, or (`toAll`) every current member at payout time. 1-20 members; creator must be a
///         member or a beneficiary. Any recipient may `close` to split the remaining balance; no contributions after.
///         Invite links: each member may set their own ephemeral key (lives in their link); anyone holding it can
///         `join` until the pot is full. A member can rotate or clear only their own key.
contract KinPot is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Pot {
        uint96 target;
        uint96 balance;
        uint64 round;
        bool closed;
        bool toAll;
    }

    uint256 public constant MAX_MEMBERS = 20;

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Pot) public pots;
    mapping(uint256 => address[]) private _members;
    mapping(uint256 => address[]) private _beneficiaries;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => bool)) public isBeneficiary;
    /// @notice id => round => member => amount contributed in that round
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public contributed;
    /// @notice id => member => their invite link key (0 = no link)
    mapping(uint256 => mapping(address => address)) public inviteKeyOf;

    event PotCreated(
        uint256 indexed id,
        address indexed creator,
        address[] beneficiaries,
        bool toAll,
        uint256 target,
        address[] members
    );
    event Contributed(uint256 indexed id, address indexed member, uint256 indexed round, uint256 amount);
    /// @notice `amount` split equally across `recipients`; the first `amount % n` get 1 base unit more.
    event PotPaid(uint256 indexed id, uint256 round, uint256 amount, address[] recipients);
    event PotClosed(uint256 indexed id, uint256 amount, address[] recipients);
    event InviteKeySet(uint256 indexed id, address indexed member, address key);
    event Joined(uint256 indexed id, address indexed member, address indexed inviter);

    error InvalidTerms();
    error NotMember();
    error Unauthorized();
    error Closed();
    error AlreadyMember();
    error Full();
    error BadSignature();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    function create(
        address[] calldata beneficiaries,
        bool toAll,
        uint96 target,
        address[] calldata members,
        address inviteKey_
    ) external returns (uint256 id) {
        if (target == 0 || members.length == 0 || members.length > MAX_MEMBERS) {
            revert InvalidTerms();
        }
        if (toAll ? beneficiaries.length != 0 : beneficiaries.length == 0 || beneficiaries.length > MAX_MEMBERS) {
            revert InvalidTerms();
        }
        id = ++count;
        pots[id] = Pot(target, 0, 0, false, toAll);
        for (uint256 i; i < members.length; ++i) {
            if (members[i] == address(0) || isMember[id][members[i]]) revert InvalidTerms();
            isMember[id][members[i]] = true;
        }
        for (uint256 i; i < beneficiaries.length; ++i) {
            if (beneficiaries[i] == address(0) || isBeneficiary[id][beneficiaries[i]]) revert InvalidTerms();
            isBeneficiary[id][beneficiaries[i]] = true;
        }
        address creator = _msgSender();
        if (!isBeneficiary[id][creator] && !isMember[id][creator]) revert InvalidTerms();
        _members[id] = members;
        _beneficiaries[id] = beneficiaries;
        emit PotCreated(id, creator, beneficiaries, toAll, target, members);
        if (inviteKey_ != address(0)) {
            if (!isMember[id][creator]) revert InvalidTerms();
            inviteKeyOf[id][creator] = inviteKey_;
            emit InviteKeySet(id, creator, inviteKey_);
        }
    }

    /// @notice Member sets, rotates or (0) clears their own invite link key.
    function setInviteKey(uint256 id, address key) external {
        address member = _msgSender();
        if (!isMember[id][member]) revert NotMember();
        inviteKeyOf[id][member] = key;
        emit InviteKeySet(id, member, key);
    }

    /// @notice Add `member` via `inviter`'s link. `signature` = inviter's link key EIP-191 sig over
    ///         keccak256(abi.encode(address(this), block.chainid, id, inviter, member)). Anyone may submit.
    function join(uint256 id, address inviter, address member, bytes calldata signature) external {
        address key = inviteKeyOf[id][inviter];
        if (key == address(0) || member == address(0)) revert InvalidTerms(); // only members ever hold a key
        if (pots[id].closed) revert Closed();
        if (isMember[id][member]) revert AlreadyMember();
        if (_members[id].length >= MAX_MEMBERS) revert Full();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(address(this), block.chainid, id, inviter, member))
        );
        if (ECDSA.recover(digest, signature) != key) revert BadSignature();
        isMember[id][member] = true;
        _members[id].push(member);
        emit Joined(id, member, inviter);
    }

    function membersOf(uint256 id) external view returns (address[] memory) {
        return _members[id];
    }

    /// @notice Who gets paid: every current member if `toAll`, else the fixed beneficiaries.
    function beneficiariesOf(uint256 id) public view returns (address[] memory) {
        return pots[id].toAll ? _members[id] : _beneficiaries[id];
    }

    /// @notice Member adds `value` AUSD (EIP-3009 ReceiveWithAuthorization, to = this).
    function contribute(
        uint256 id,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        address member = _msgSender();
        (address[] memory to, uint256 payout) = _book(id, member, value);
        IERC3009(ausd).receiveWithAuthorization(member, address(this), value, validAfter, validBefore, nonce, signature);
        if (payout != 0) _split(to, payout);
    }

    /// @dev Effects of a contribution: records it, advances rounds, returns who to pay and how much (split later).
    function _book(uint256 id, address member, uint256 value) private returns (address[] memory to, uint256 payout) {
        if (!isMember[id][member]) revert NotMember();
        if (value == 0) revert InvalidTerms();
        Pot storage p = pots[id];
        if (p.closed) revert Closed();
        uint256 bal = p.balance + value;
        uint256 round = p.round;
        contributed[id][round][member] += value;
        emit Contributed(id, member, round, value);

        // ponytail: pays every full multiple of target at once (one event), so no leftover >= target sits idle
        uint256 n = bal / p.target;
        payout = n * p.target;
        p.balance = uint96(bal - payout); // < target, fits
        if (n != 0) {
            p.round = uint64(round + n);
            to = beneficiariesOf(id);
            emit PotPaid(id, round, payout, to);
        }
    }

    /// @notice A recipient ends the pot; the remaining balance is split like a payout.
    function close(uint256 id) external nonReentrant {
        Pot storage p = pots[id];
        address caller = _msgSender();
        if (p.target == 0 || !(p.toAll ? isMember[id][caller] : isBeneficiary[id][caller])) revert Unauthorized();
        if (p.closed) revert Closed();
        uint256 bal = p.balance;
        (p.closed, p.balance) = (true, 0);
        address[] memory to = beneficiariesOf(id);
        emit PotClosed(id, bal, to);
        if (bal != 0) _split(to, bal);
    }

    /// @dev Equal shares; the first `amount % n` recipients get 1 base unit more, so the sum is exactly `amount`.
    function _split(address[] memory to, uint256 amount) private {
        uint256 n = to.length;
        uint256 share = amount / n;
        uint256 extra = amount % n;
        for (uint256 i; i < n; ++i) {
            uint256 v = i < extra ? share + 1 : share;
            if (v != 0) IERC20(ausd).safeTransfer(to[i], v);
        }
    }
}
