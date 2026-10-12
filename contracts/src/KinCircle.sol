// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title KinCircle
/// @notice Savings circle (ROSCA). Rules:
///  1. Creator fixes `seats` (n = 2-20 people), lists the members known so far in payout order (creator
///     must be members[0], 1..n distinct nonzero), a fixed `contribution` and `roundLength` seconds.
///     Joining closes at `joinBy` = create time + 3 days. Open seats are filled before the start by
///     invite links: any member sets an invite key (`setInviteKey`); whoever holds it signs for a new
///     address, which `claimSeat` appends to the payout order (join order).
///  2. Member at payout slot i `join`s by depositing `depositFor` = (n-1-i) * contribution, i.e. every
///     payment they still owe after receiving their pot (last slot deposits 0). n is `seats`, fixed at
///     create, so later claims never change a deposit. When all n seats have joined, round 0 starts.
///     If not started by `joinBy`, joined members may `leave` to reclaim their deposit (they stay listed).
///  3. Each round every non-defaulted member `pay`s `contribution` once. Round r's pot goes to members[r].
///  4. `settle` (anyone) once the round has ended OR everyone has paid. Each unpaid member is marked
///     defaulted and min(deposit, contribution) of their deposit covers their share; if the deposit is
///     gone the pot is simply smaller. Defaulted members can no longer pay. Pot is paid to
///     members[round], next round starts at settle time. If members[round] has defaulted, their pot
///     is forfeited (held) instead of paid.
///  5. After the last round, remaining deposits go back to their owners, and the forfeited pool is
///     split equally among members who never defaulted (among everyone if all defaulted; dust to the last).
contract KinCircle is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MEMBERS = 20;

    struct Circle {
        uint96 contribution;
        uint40 roundLength;
        uint40 roundStart; // 0 until all joined
        uint8 round;
        uint8 joined;
        uint8 paidCount;
        uint96 pot;
        uint96 forfeit;
        uint40 joinBy;
        uint8 seats; // total people; members.length == seats once started
    }

    struct Member {
        bool isMember;
        bool joined;
        bool defaulted;
        uint8 slot; // payout index
        uint8 paidRound; // round + 1 of the last round paid
        uint96 deposit;
    }

    address public immutable ausd;
    uint256 public count;
    mapping(uint256 => Circle) public circles;
    mapping(uint256 => address[]) private _members;
    mapping(uint256 => mapping(address => Member)) public memberInfo;
    /// @notice Address of a member's invite-link key (0 = no link).
    mapping(uint256 => mapping(address => address)) public inviteKeyOf;

    event CircleCreated(
        uint256 indexed id, address indexed creator, uint256 contribution, uint40 roundLength, address[] members
    );
    event InviteKeySet(uint256 indexed id, address indexed member, address key);
    event SeatClaimed(uint256 indexed id, address indexed member, address indexed inviter);
    event Joined(uint256 indexed id, address indexed member, uint256 deposit);
    event Left(uint256 indexed id, address indexed member, uint256 deposit);
    event Started(uint256 indexed id, uint40 roundStart);
    event Paid(uint256 indexed id, address indexed member, uint256 indexed round);
    event Defaulted(uint256 indexed id, address indexed member, uint256 indexed round, uint256 covered);
    event PaidOut(uint256 indexed id, address indexed to, uint256 indexed round, uint256 amount);
    event DepositReturned(uint256 indexed id, address indexed member, uint256 amount);
    event Forfeited(uint256 indexed id, address indexed member, uint256 indexed round, uint256 amount);
    event ForfeitShared(uint256 indexed id, address indexed member, uint256 amount);

    error InvalidTerms();
    error NotMember();
    error AlreadyJoined();
    error AlreadyPaid();
    error NotActive();
    error RoundNotOver();
    error IsDefaulted();
    error Full();
    error BadSignature();

    constructor(address forwarder, address ausd_) ERC2771Context(forwarder) {
        ausd = ausd_;
    }

    function create(address[] calldata members, uint8 seats, uint96 contribution, uint40 roundLength)
        external
        returns (uint256 id)
    {
        uint256 n = members.length;
        if (
            seats < 2 || seats > MAX_MEMBERS || n == 0 || n > seats || members[0] != _msgSender() || contribution == 0
                || roundLength == 0 || uint256(seats) * contribution > type(uint96).max // round pot must fit
        ) revert InvalidTerms();
        id = ++count;
        circles[id] = Circle(contribution, roundLength, 0, 0, 0, 0, 0, 0, uint40(block.timestamp + 3 days), seats);
        for (uint256 i; i < n; ++i) {
            Member storage m = memberInfo[id][members[i]];
            if (members[i] == address(0) || members[i] == address(this) || members[i] == ausd || m.isMember) {
                revert InvalidTerms();
            }
            m.isMember = true;
            m.slot = uint8(i);
        }
        _members[id] = members;
        emit CircleCreated(id, members[0], contribution, roundLength, members);
    }

    function membersOf(uint256 id) external view returns (address[] memory) {
        return _members[id];
    }

    /// @notice Security deposit `member` must post to join: (seats-1-slot) * contribution.
    function depositFor(uint256 id, address member) public view returns (uint256) {
        Member storage m = memberInfo[id][member];
        if (!m.isMember) revert NotMember();
        Circle storage c = circles[id];
        return (uint256(c.seats) - 1 - m.slot) * c.contribution;
    }

    /// @notice Set (or with 0, turn off) your own invite-link key. Only before the circle starts.
    function setInviteKey(uint256 id, address key) external {
        Circle storage c = circles[id];
        address sender = _msgSender();
        if (!memberInfo[id][sender].isMember) revert NotMember();
        if (c.roundStart != 0 || block.timestamp >= c.joinBy) revert NotActive();
        inviteKeyOf[id][sender] = key;
        emit InviteKeySet(id, sender, key);
    }

    /// @notice Give `member` the next open seat. `signature` is by `inviter`'s invite key over
    ///         EIP-191 keccak256(abi.encode(this, chainid, id, inviter, member)). Anyone may submit.
    ///         One seat per link: the key is cleared on use; the inviter sets a new one for the next seat.
    function claimSeat(uint256 id, address inviter, address member, bytes calldata signature) external {
        Circle storage c = circles[id];
        if (c.roundStart != 0 || block.timestamp >= c.joinBy) revert NotActive();
        address[] storage members = _members[id];
        if (members.length >= c.seats) revert Full();
        address key = inviteKeyOf[id][inviter]; // only members can set one
        if (key == address(0)) revert NotMember();
        Member storage m = memberInfo[id][member];
        if (member == address(0) || member == address(this) || member == ausd) revert InvalidTerms();
        if (m.isMember) revert AlreadyJoined();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(address(this), block.chainid, id, inviter, member))
        );
        if (ECDSA.recover(digest, signature) != key) revert BadSignature();
        delete inviteKeyOf[id][inviter]; // one seat per link
        m.isMember = true;
        m.slot = uint8(members.length);
        members.push(member);
        emit SeatClaimed(id, member, inviter);
    }

    /// @notice Deposit exactly `depositFor(id, sender)` to join (value 0 for last slot; auth ignored).
    ///         Last joiner starts round 0. Reverts after `joinBy`.
    function join(
        uint256 id,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        Circle storage c = circles[id];
        address sender = _msgSender();
        Member storage m = memberInfo[id][sender];
        if (!m.isMember) revert NotMember();
        if (m.joined) revert AlreadyJoined();
        if (block.timestamp >= c.joinBy) revert NotActive();
        if (value != depositFor(id, sender)) revert InvalidTerms();
        m.joined = true;
        m.deposit = uint96(value); // <= n * contribution, checked at create
        emit Joined(id, sender, value);
        if (++c.joined == c.seats) {
            c.roundStart = uint40(block.timestamp);
            emit Started(id, c.roundStart);
        }
        if (value != 0) {
            IERC3009(ausd).receiveWithAuthorization(sender, address(this), value, validAfter, validBefore, nonce, signature);
        }
    }

    /// @notice Reclaim your deposit if the circle never started by `joinBy`.
    function leave(uint256 id) external nonReentrant {
        Circle storage c = circles[id];
        address sender = _msgSender();
        Member storage m = memberInfo[id][sender];
        if (!m.joined) revert NotMember();
        if (c.roundStart != 0 || block.timestamp < c.joinBy) revert NotActive();
        uint256 dep = m.deposit;
        (m.joined, m.deposit) = (false, 0);
        c.joined--;
        emit Left(id, sender, dep);
        if (dep != 0) IERC20(ausd).safeTransfer(sender, dep);
    }

    /// @notice Pay this round's `contribution`.
    function pay(
        uint256 id,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        Circle storage c = circles[id];
        if (c.roundStart == 0 || c.round >= _members[id].length) revert NotActive();
        address sender = _msgSender();
        Member storage m = memberInfo[id][sender];
        if (!m.isMember) revert NotMember();
        if (m.defaulted) revert IsDefaulted();
        if (m.paidRound == c.round + 1) revert AlreadyPaid();
        if (value != c.contribution) revert InvalidTerms();
        m.paidRound = c.round + 1;
        c.paidCount++;
        c.pot += uint96(value);
        emit Paid(id, sender, c.round);
        IERC3009(ausd).receiveWithAuthorization(sender, address(this), value, validAfter, validBefore, nonce, signature);
    }

    /// @notice Close the current round and pay members[round]. See contract rules.
    function settle(uint256 id) external nonReentrant {
        Circle storage c = circles[id];
        address[] storage members = _members[id];
        uint256 n = members.length;
        uint8 round = c.round;
        if (c.roundStart == 0 || round >= n) revert NotActive();
        if (block.timestamp < uint256(c.roundStart) + c.roundLength && c.paidCount < n) revert RoundNotOver();

        uint256 pot = c.pot;
        if (c.paidCount < n) {
            for (uint256 i; i < n; ++i) {
                Member storage m = memberInfo[id][members[i]];
                if (m.paidRound == round + 1) continue;
                uint256 covered = m.deposit < c.contribution ? m.deposit : c.contribution;
                pot += covered;
                m.deposit -= uint96(covered);
                m.defaulted = true;
                emit Defaulted(id, members[i], round, covered);
            }
        }
        address to = members[round];
        (c.pot, c.paidCount, c.round, c.roundStart) = (0, 0, round + 1, uint40(block.timestamp));
        if (memberInfo[id][to].defaulted) {
            c.forfeit = SafeCast.toUint96(c.forfeit + pot);
            emit Forfeited(id, to, round, pot);
        } else {
            emit PaidOut(id, to, round, pot);
            if (pot != 0) IERC20(ausd).safeTransfer(to, pot);
        }

        if (round + 1 == n) {
            uint256 honest;
            for (uint256 i; i < n; ++i) {
                Member storage m = memberInfo[id][members[i]];
                if (!m.defaulted) ++honest;
                uint256 dep = m.deposit; // defaulters keep leftovers: their later obligations were covered
                if (dep == 0) continue;
                m.deposit = 0;
                emit DepositReturned(id, members[i], dep);
                IERC20(ausd).safeTransfer(members[i], dep);
            }
            uint256 forfeit = c.forfeit;
            if (forfeit == 0) return;
            c.forfeit = 0;
            uint256 share = forfeit / (honest == 0 ? n : honest);
            address last;
            for (uint256 i; i < n; ++i) {
                if (honest != 0 && memberInfo[id][members[i]].defaulted) continue;
                last = members[i];
                forfeit -= share;
                emit ForfeitShared(id, last, share);
                IERC20(ausd).safeTransfer(last, share);
            }
            if (forfeit != 0) IERC20(ausd).safeTransfer(last, forfeit); // rounding dust
        }
    }
}
