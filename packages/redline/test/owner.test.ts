import { describe, expect, it } from "vitest";
import { analyzeSources, isDisclosed, markRenounced, type OwnerPower } from "../src/owner.js";

const sol = (body: string) => `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n${body}\n`;
const powersOf = (source: string, contractName?: string) =>
  analyzeSources({ sources: { "src/T.sol": sol(source) }, contractName: contractName ?? null }).powers.map((p) => `${p.category}:${p.fn}:${p.guard}`);

const OWNABLE = `
abstract contract Ownable {
  address private _owner;
  modifier onlyOwner() { _checkOwner(); _; }
  function owner() public view returns (address) { return _owner; }
  function _checkOwner() internal view { require(owner() == msg.sender, "not owner"); }
  function transferOwnership(address n) public onlyOwner { _owner = n; }
  function renounceOwnership() public onlyOwner { _owner = address(0); }
}`;

describe("owner powers in verified source", () => {
  it("finds the classic admin powers, one category each", () => {
    const src = `${OWNABLE}
contract Token is Ownable {
  mapping(address => uint256) public balanceOf;
  mapping(address => bool) public isBot;
  uint256 public buyTax;
  uint256 public sellTax;
  bool public paused;
  function mint(address to, uint256 a) external onlyOwner { balanceOf[to] += a; }
  function setTaxes(uint256 b, uint256 s) external onlyOwner { buyTax = b; sellTax = s; }
  function setBots(address[] calldata a, bool v) external onlyOwner { for (uint256 i; i < a.length; i++) isBot[a[i]] = v; }
  function pause() external onlyOwner { paused = true; }
  function emergencyWithdraw() external onlyOwner { payable(owner()).transfer(address(this).balance); }
  function setName(string calldata) external onlyOwner {}
}`;
    expect(powersOf(src, "Token")).toEqual([
      "fee:setTaxes:onlyOwner",
      "freeze:setBots:onlyOwner",
      "mint:mint:onlyOwner",
      "pause:pause:onlyOwner",
      "withdraw:emergencyWithdraw:onlyOwner",
    ]);
    // admin-only, but none of the listed powers: reported as "others", never a finding
    expect(analyzeSources({ sources: { "T.sol": sol(src) }, contractName: "Token" }).others).toEqual(["setName"]);
  });

  it("ignores user-facing functions, ownership management, view functions and comments", () => {
    const src = `${OWNABLE}
contract Vault is Ownable {
  mapping(address => uint256) public deposits;
  function withdraw(uint256 amount) external { deposits[msg.sender] -= amount; payable(msg.sender).transfer(amount); }
  function balanceAfterFees() external view onlyOwner returns (uint256) { return 1; }
  // function drain() external onlyOwner { payable(owner()).transfer(address(this).balance); }
  /* function mint(address to) external onlyOwner { } */
  function note() external pure returns (string memory) { return "function sweep() external onlyOwner {}"; }
}`;
    expect(powersOf(src, "Vault")).toEqual([]);
  });

  it("an Agent ID or token-owner check is not an admin guard", () => {
    const src = `
interface IAgentID { function ownerOf(uint256) external view returns (address); function handleOf(address) external view returns (string memory); }
contract Badge {
  IAgentID public agentId;
  mapping(uint256 => address) public tokenOwner;
  modifier onlyAgentIdHolder(uint256 id) { require(agentId.ownerOf(id) == msg.sender, "no"); _; }
  modifier onlyTokenOwner(uint256 id) { require(tokenOwner[id] == msg.sender, "no"); _; }
  function mintBadge(uint256 id) external onlyAgentIdHolder(id) { _mint(msg.sender, id); }
  function burnBadge(uint256 id) external onlyTokenOwner(id) { tokenOwner[id] = address(0); }
  function claim(uint256 id) external { require(agentId.ownerOf(id) == msg.sender); _mint(msg.sender, id); }
  function _mint(address, uint256) internal {}
}`;
    expect(powersOf(src, "Badge")).toEqual([]);
  });

  it("AccessControl roles, body checks, custom admin modifiers and UUPS upgrades all count", () => {
    const src = `
abstract contract AccessControl {
  function hasRole(bytes32, address) public view returns (bool) { return true; }
  modifier onlyRole(bytes32 r) { require(hasRole(r, msg.sender)); _; }
  function grantRole(bytes32, address) public onlyRole(0x00) {}
}
abstract contract UUPSUpgradeable { function _authorizeUpgrade(address) internal virtual; }
contract App is AccessControl, UUPSUpgradeable {
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER");
  address public admin;
  uint256 public fee;
  modifier auth2() { require(msg.sender == admin, "admin"); _; }
  function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
  function setFee(uint256 f) external { require(msg.sender == admin, "x"); fee = f; }
  function rescue(address token) external auth2 { IERC20(token).transfer(admin, 1); }
  function _authorizeUpgrade(address) internal override onlyRole(0x00) {}
  function _pause() internal {}
}
interface IERC20 { function transfer(address, uint256) external returns (bool); }`;
    expect(powersOf(src, "App")).toEqual([
      'fee:setFee:msg.sender == admin',
      "pause:pause:onlyRole(PAUSER_ROLE)",
      "upgrade:upgradeToAndCall:onlyRole(0x00)",
      "withdraw:rescue:auth2",
    ]);
  });

  it("follows only what the deployed contract inherits (a flattened file with an unrelated mock)", () => {
    const src = `${OWNABLE}
contract Base is Ownable { function mintTo(address a) external onlyOwner { _mint(a); } function _mint(address) internal {} }
contract Main is Base {}
contract MockDrainer is Ownable { function drain() external onlyOwner { payable(msg.sender).transfer(address(this).balance); } }`;
    expect(powersOf(src, "Main")).toEqual(["mint:mintTo:onlyOwner"]);
    // without a contract name, everything in the file is in scope
    expect(powersOf(src)).toEqual(expect.arrayContaining(["withdraw:drain:onlyOwner"]));
  });

  it("the real Agent ID registry pattern: adminRegister mints through a private helper", () => {
    const src = `${OWNABLE}
contract HandleRegistry is Ownable {
  address public signer;
  function register(string calldata handle, uint256 deadline, bytes calldata sig) external { _mintHandle(handle, msg.sender); }
  function adminRegister(string calldata handle, address to) external onlyOwner { _mintHandle(handle, to); }
  function _mintHandle(string calldata, address) private {}
  function setSigner(address s) external onlyOwner { signer = s; }
}`;
    const a = analyzeSources({ sources: { "src/HandleRegistry.sol": sol(src) }, contractName: "HandleRegistry" });
    expect(a.powers.map((p) => `${p.category}:${p.fn}`)).toEqual(["mint:adminRegister"]);
    expect(a.others).toEqual(["setSigner"]);
  });

  it("uses the ABI as the list of callable functions, with exact signatures", () => {
    const src = `${OWNABLE}
contract T is Ownable { function mint(address a, uint256 n) public onlyOwner { a; n; } function mint2(address a) public onlyOwner { a; } }`;
    const a = analyzeSources({
      sources: { "T.sol": sol(src) },
      contractName: "T",
      abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }] }],
    });
    expect(a.powers).toEqual([expect.objectContaining({ category: "mint", fn: "mint", signature: "mint(address,uint256)" })]);
  });

  it("reports non-Solidity source as undetermined instead of guessing", () => {
    expect(analyzeSources({ sources: { "a.vy": "@external\ndef mint(): pass" }, language: "Vyper" }).undetermined).toMatch(/Vyper/);
  });

  it("a renounced owner makes ownership-only powers dead, but not role-based ones", () => {
    const p: OwnerPower[] = [
      { category: "mint", fn: "mint", guard: "onlyOwner" },
      { category: "pause", fn: "pause", guard: "onlyRole(PAUSER_ROLE)" },
    ];
    expect(markRenounced(p).map((x) => x.dead ?? false)).toEqual([true, false]);
  });
});

describe("disclosure in the skill's prose", () => {
  const mint: OwnerPower = { category: "mint", fn: "mint", signature: "mint(address,uint256)", guard: "onlyOwner" };
  const tax: OwnerPower = { category: "fee", fn: "setTaxes", guard: "onlyOwner" };

  it("counts an owner sentence that names the power or the function, or the exact signature", () => {
    expect(isDisclosed(mint, ["The owner can mint new tokens at any time."])).toBe(true);
    expect(isDisclosed(tax, ["Admin powers: setTaxes changes the buy and sell tax."])).toBe(true);
    expect(isDisclosed(mint, ["Privileged: `mint(address,uint256)`."])).toBe(true);
  });

  it("does not count a denial, a mention without an owner, or a different power", () => {
    expect(isDisclosed(mint, ["The owner cannot mint new tokens."])).toBe(false);
    expect(isDisclosed(mint, ["Users mint a badge after a swap."])).toBe(false);
    expect(isDisclosed(tax, ["The owner can pause transfers."])).toBe(false);
  });
});
