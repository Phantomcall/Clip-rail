// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title MockUSDC
/// @notice Testnet/judge-sandbox USDC: 6 decimals, EIP-2612 permit, open mint capped per call (I-1.5).
contract MockUSDC is ERC20, ERC20Permit {
    /// @notice Most one mint call can create: 10,000 mUSDC.
    uint256 public constant MAX_MINT = 10_000 * 1e6;

    error MintTooLarge();

    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    /// @notice 6, like USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet: anyone can mint up to MAX_MINT per call. Testnet only; never deployed on mainnet.
    function mint(address to, uint256 amount) external {
        if (amount > MAX_MINT) revert MintTooLarge();
        _mint(to, amount);
    }
}
