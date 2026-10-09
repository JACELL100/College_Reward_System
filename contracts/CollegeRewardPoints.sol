// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  CollegeRewardPoints (CRP) - "CampusCoin"
 * @author FRCRCE Blockchain ISE project
 * @notice An ERC20 token that a college uses to reward students for achievements
 *         (hackathons, papers, volunteering, attendance ...). Students can send
 *         points to each other and redeem (burn) them for items in the campus store.
 *
 * @dev    Design summary (explained in the viva):
 *         - Fully self-contained ERC20 implementation (no OpenZeppelin imports) so
 *           every line can be read and explained.
 *         - decimals = 0  -> 1 token = 1 whole reward point (no fractions).
 *         - Supply starts at 0. Tokens are only created ("minted") by authorised
 *           issuers via issueReward / batchIssueReward and destroyed ("burned")
 *           by students via redeem.
 *         - Roles: one `owner` (college admin) and any number of `issuers`
 *           (faculty). The owner is ALWAYS treated as an issuer (see isIssuer).
 *         - Safety controls: emergency pause, a per-recipient cap on how many
 *           points can be issued in one go (maxIssuePerTx), a batch size cap and
 *           a max length for the on-chain "reason" string.
 *         - Custom errors (instead of revert strings) are cheaper in gas and give
 *           the frontend structured, decodable failure reasons.
 */
contract CollegeRewardPoints {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Maximum number of recipients in a single batchIssueReward call.
    /// @dev    Bounds the loop so a batch can never run out of block gas.
    uint256 public constant MAX_BATCH_SIZE = 50;

    /// @notice Maximum length (in bytes) of the human-readable reward reason.
    /// @dev    Strings are stored in event logs; capping keeps gas predictable.
    uint256 public constant MAX_REASON_LENGTH = 96;

    // ---------------------------------------------------------------------
    // ERC20 metadata & state
    // ---------------------------------------------------------------------

    /// @notice Token name shown in wallets / Etherscan.
    string public constant name = "College Reward Points";

    /// @notice Token ticker symbol.
    string public constant symbol = "CRP";

    /// @notice Number of decimals. 0 means points are whole numbers only.
    uint8 public constant decimals = 0;

    /// @notice Total number of points currently in circulation.
    uint256 public totalSupply;

    /// @dev account => point balance
    mapping(address => uint256) private _balances;

    /// @dev owner => spender => amount the spender may move on owner's behalf
    mapping(address => mapping(address => uint256)) private _allowances;

    // ---------------------------------------------------------------------
    // Access control & admin state
    // ---------------------------------------------------------------------

    /// @notice The college admin account. Can manage issuers and settings.
    address public owner;

    /// @dev Explicitly added issuers. The owner is an issuer implicitly (see isIssuer).
    mapping(address => bool) private _issuers;

    /// @notice True while the contract is paused (no minting, transfers or redemptions).
    bool public paused;

    /// @notice Maximum points that can be issued to ONE recipient in one call.
    uint256 public maxIssuePerTx = 1000;

    /// @notice Lifetime total of points ever issued (minted).
    uint256 public totalIssued;

    /// @notice Lifetime total of points ever redeemed (burned).
    uint256 public totalRedeemed;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Standard ERC20 event. from = 0x0 for mint, to = 0x0 for burn.
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Standard ERC20 event emitted when an allowance is set.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Emitted for every reward issued, together with the reason.
    event RewardIssued(address indexed issuer, address indexed to, uint256 amount, string reason);

    /// @notice Emitted when a student redeems (burns) points for a store item.
    event Redeemed(address indexed student, uint256 amount, uint256 indexed itemId);

    /// @notice Emitted when an account is granted the issuer role.
    event IssuerAdded(address indexed account);

    /// @notice Emitted when an account loses the issuer role.
    event IssuerRemoved(address indexed account);

    /// @notice Emitted when the contract owner changes.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when the contract is paused.
    event Paused(address account);

    /// @notice Emitted when the contract is unpaused.
    event Unpaused(address account);

    /// @notice Emitted when the per-transaction issue cap changes.
    event MaxIssuePerTxUpdated(uint256 newMax);

    // ---------------------------------------------------------------------
    // Custom errors
    // ---------------------------------------------------------------------

    /// @notice Caller is not the owner.
    error NotOwner();
    /// @notice Caller is not an issuer (and not the owner).
    error NotIssuer();
    /// @notice Action is blocked because the contract is paused.
    error ContractPaused();
    /// @notice The zero address (0x000...0) is not allowed here.
    error ZeroAddress();
    /// @notice Amount must be greater than zero.
    error ZeroAmount();
    /// @notice Account does not hold enough points.
    error InsufficientBalance(uint256 available, uint256 required);
    /// @notice Spender's allowance is too small.
    error InsufficientAllowance(uint256 available, uint256 required);
    /// @notice Amount for a single recipient is above maxIssuePerTx.
    error ExceedsMaxIssue(uint256 amount, uint256 max);
    /// @notice recipients[] and amounts[] differ in length, or are empty.
    error LengthMismatch();
    /// @notice Batch has more than MAX_BATCH_SIZE recipients.
    error BatchTooLarge(uint256 size, uint256 max);
    /// @notice Reason string is longer than MAX_REASON_LENGTH bytes.
    error ReasonTooLong();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev Restricts a function to the owner.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Restricts a function to issuers (the owner always qualifies).
    modifier onlyIssuer() {
        if (!isIssuer(msg.sender)) revert NotIssuer();
        _;
    }

    /// @dev Blocks a function while the contract is paused.
    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploys the token. The deployer becomes owner (and therefore an issuer).
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit IssuerAdded(msg.sender);
    }

    // ---------------------------------------------------------------------
    // ERC20 read functions
    // ---------------------------------------------------------------------

    /// @notice Returns the point balance of `account`.
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @notice Returns how many points `spender` may still move from `tokenOwner`.
    function allowance(address tokenOwner, address spender) external view returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    // ---------------------------------------------------------------------
    // ERC20 write functions
    // ---------------------------------------------------------------------

    /// @notice Sends `amount` points from the caller to `to`.
    /// @return true on success (reverts on failure, as per ERC20 best practice).
    function transfer(address to, uint256 amount) external whenNotPaused returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Lets `spender` move up to `amount` of the caller's points.
    /// @dev    Setting a new value overwrites the old one (not additive).
    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Moves `amount` points from `from` to `to` using the caller's allowance.
    /// @dev    An allowance of type(uint256).max is treated as "unlimited" and not decreased.
    function transferFrom(address from, address to, uint256 amount) external whenNotPaused returns (bool) {
        uint256 current = _allowances[from][msg.sender];
        if (current != type(uint256).max) {
            if (current < amount) revert InsufficientAllowance(current, amount);
            unchecked {
                _allowances[from][msg.sender] = current - amount; // safe: checked above
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    // ---------------------------------------------------------------------
    // Rewards: issue (mint) and redeem (burn)
    // ---------------------------------------------------------------------

    /**
     * @notice Issues (mints) `amount` new points to student `to`.
     * @param  to      Student wallet receiving the reward.
     * @param  amount  Number of points (1 .. maxIssuePerTx).
     * @param  reason  Short description stored in the RewardIssued event (<= 96 bytes).
     */
    function issueReward(address to, uint256 amount, string calldata reason)
        external
        onlyIssuer
        whenNotPaused
    {
        if (bytes(reason).length > MAX_REASON_LENGTH) revert ReasonTooLong();
        _issue(to, amount, reason);
    }

    /**
     * @notice Issues rewards to many students in one transaction (same reason for all).
     * @dev    recipients[i] receives amounts[i]. Each amount is checked against maxIssuePerTx.
     * @param  recipients Student wallets (1 .. MAX_BATCH_SIZE entries).
     * @param  amounts    Points per student; must be the same length as recipients.
     * @param  reason     Shared reason (<= 96 bytes).
     */
    function batchIssueReward(address[] calldata recipients, uint256[] calldata amounts, string calldata reason)
        external
        onlyIssuer
        whenNotPaused
    {
        uint256 size = recipients.length;
        if (size == 0 || size != amounts.length) revert LengthMismatch();
        if (size > MAX_BATCH_SIZE) revert BatchTooLarge(size, MAX_BATCH_SIZE);
        if (bytes(reason).length > MAX_REASON_LENGTH) revert ReasonTooLong();

        for (uint256 i = 0; i < size; ++i) {
            _issue(recipients[i], amounts[i], reason);
        }
    }

    /**
     * @notice Redeems (burns) `amount` of the caller's points for store item `itemId`.
     * @dev    The off-chain backend watches the Redeemed event and creates a voucher.
     * @param  amount Points to spend (the item's cost).
     * @param  itemId ID of the store item in the college database.
     */
    function redeem(uint256 amount, uint256 itemId) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = _balances[msg.sender];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        unchecked {
            _balances[msg.sender] = bal - amount; // safe: checked above
            totalSupply -= amount;                // safe: totalSupply >= any balance
        }
        totalRedeemed += amount;

        emit Transfer(msg.sender, address(0), amount);
        emit Redeemed(msg.sender, amount, itemId);
    }

    // ---------------------------------------------------------------------
    // Role management
    // ---------------------------------------------------------------------

    /// @notice True if `account` may issue rewards. The owner always can.
    function isIssuer(address account) public view returns (bool) {
        return account == owner || _issuers[account];
    }

    /// @notice Grants the issuer role to `account` (e.g. a faculty member).
    function addIssuer(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (!_issuers[account]) {
            _issuers[account] = true;
            emit IssuerAdded(account);
        }
    }

    /// @notice Revokes the issuer role from `account`.
    /// @dev    Calling this for the owner is allowed but has no practical effect,
    ///         because isIssuer() always returns true for the current owner.
    function removeIssuer(address account) external onlyOwner {
        if (_issuers[account]) {
            _issuers[account] = false;
            emit IssuerRemoved(account);
        }
    }

    /// @notice Hands the owner role to `newOwner` (who implicitly becomes an issuer).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    // ---------------------------------------------------------------------
    // Admin settings
    // ---------------------------------------------------------------------

    /// @notice Changes the maximum points per recipient per issue call.
    function setMaxIssuePerTx(uint256 newMax) external onlyOwner {
        if (newMax == 0) revert ZeroAmount();
        maxIssuePerTx = newMax;
        emit MaxIssuePerTxUpdated(newMax);
    }

    /// @notice Emergency stop: blocks issuing, transfers and redemptions.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Resumes normal operation after a pause.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// @dev Moves points between two accounts after validating inputs.
    ///      Zero-value transfers are allowed, as required by the ERC20 standard (EIP-20).
    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = _balances[from];
        if (bal < amount) revert InsufficientBalance(bal, amount);

        unchecked {
            _balances[from] = bal - amount; // safe: checked above
            _balances[to] += amount;        // safe: sum of balances == totalSupply
        }
        emit Transfer(from, to, amount);
    }

    /// @dev Mints `amount` points to `to` and records the reason. Shared by single & batch issue.
    function _issue(address to, uint256 amount, string calldata reason) internal {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxIssuePerTx) revert ExceedsMaxIssue(amount, maxIssuePerTx);

        totalSupply += amount; // checked: reverts on overflow
        totalIssued += amount;
        unchecked {
            _balances[to] += amount; // safe: bounded by totalSupply
        }

        emit Transfer(address(0), to, amount);
        emit RewardIssued(msg.sender, to, amount, reason);
    }
}
