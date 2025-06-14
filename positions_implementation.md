# DeFi Portfolio Dashboard

DeFi Portfolio Dashboard for tracking assets and positions across protocols.


## Features

- Track token balances across multiple chains (Ethereum, Base, Bittensor EVM testnet, Monad)
- Monitor DeFi positions in protocols like Aave, Lido, and Yearn
- Performance optimizations with caching and multicall batching
- Simple command-line interface

## Supported Chains

- Ethereum Mainnet
- Base
- Bittensor EVM Testnet
- Monad Testnet

## Supported Protocols

- Aave (lending/borrowing)
- Lido (staking)
- Yearn (yield)
- Pendle (yield - partial configuration, see details below)

Details on how each protocol is integrated, including relevant contract addresses, ABIs (or where to find them), and key functions used. The primary services implemented are for Aave, Lido, and Yearn.

### Pendle (Partial Configuration)

*   **Status:** Configuration for Pendle (token, vePendle, marketFactory) exists in `src/config/protocols.js` and `src/config/abis.js`. However, a full `pendleService.js` to fetch and process Pendle positions is not implemented in the current version.
*   **Note on Market Data:** For a full Pendle integration, dynamic market data (PT and YT addresses, maturities) would need to be fetched. The comments in `src/config/protocols.js` suggest using the Pendle API/SDK or a **subgraph** for this purpose.
*   **Key Contracts & Addresses (Ethereum - from `src/config/protocols.js`):**
    *   `pendleToken`: `0x808507121b80c02388fad14726482e061b8da827`
    *   `vePendle`: `0x4f30A9D41B80ecC5B94306AB4364951AE3170210`
    *   `marketFactory`: `0x6fcf753f2C67b83f7B09746Bbc4FA0047b35D050` (Pendle marketFactory V5)
*   **ABIs (from `src/config/abis.js`):**
    *   `pendleMarket`: For PT and YT tokens.
    *   `vePendle`: For vePENDLE contract interactions.

### Aave (Lending/Borrowing)

Integration with Aave V3 for tracking supplied and borrowed assets.

*   **Chains:** Ethereum Mainnet
*   **Key Contracts & Addresses (Ethereum):**
    *   `PoolAddressesProvider`: `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` (Source: `src/config/protocols.js`)
    *   `UiPoolDataProvider`: `0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC` (Source: `src/config/protocols.js`)
    *   `Pool`: Address is dynamically fetched by calling `getPool()` on the `PoolAddressesProvider` contract.
*   **ABIs:**
    *   `UiPoolDataProvider`: Defined in `src/config/abis.js` as `abis.aaveUiPoolDataProvider` (human-readable format).
    *   `ERC20`: Defined in `src/config/abis.js` as `abis.erc20` (human-readable format) for token interactions (symbol, decimals).
    *   `PoolAddressesProvider`: Inline ABI `["function getPool() view returns (address)"]` used in `src/services/aaveService.js`.
    *   `Pool`: Inline ABI `["function getUserAccountData(address) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"]` used in `src/services/aaveService.js`.
    *   ERC20 `symbol()` fallback (bytes32): Inline ABI `["function symbol() view returns (bytes32)"]` used in `src/services/aaveService.js`.
*   **Key Functions Used (from `src/services/aaveService.js`):**
    *   From `PoolAddressesProvider` (`addressesProviderContract`):
        *   `getPool()`
    *   From `UiPoolDataProvider` (`uiPoolDataProviderContract`):
        *   `getUserReservesData(poolAddressesProvider, walletAddress)`
    *   From `Pool` (`poolContract`):
        *   `getUserAccountData(walletAddress)`
    *   From ERC20 contracts (`tokenContract`, `bytes32Contract`):
        *   `symbol()`
        *   `decimals()`

### Lido (Staking)

Integration with Lido for tracking staked ETH (stETH) and wrapped staked ETH (wstETH).

*   **Chains:** Ethereum Mainnet
*   **Key Contracts & Addresses (Ethereum):**
    *   `stETH`: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` (Source: `src/config/protocols.js`)
    *   `wstETH`: `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` (Source: `src/config/protocols.js`)
*   **ABIs:**
    *   `stETH`: Defined in `src/config/abis.js` as `abis.lidoStEth` (human-readable format). Includes `sharesOf`, `getPooledEthByShares`, `decimals`, `symbol`.
    *   `wstETH`: Uses the standard `abis.erc20` defined in `src/config/abis.js` (human-readable format).
*   **Key Functions Used (from `src/services/lidoService.js`):**
    *   From `stETHContract`:
        *   `sharesOf(walletAddress)`
        *   `getPooledEthByShares(stETHShares)`
        *   `decimals()`
        *   `symbol()`
    *   From `wstETHContract` (ERC20):
        *   `balanceOf(walletAddress)`
        *   `decimals()`
        *   `symbol()`

### Yearn (Yield)

Integration with Yearn Finance for tracking assets deposited in Yearn Vaults.

*   **Chains:** Ethereum Mainnet
*   **Key Contracts & Addresses (Ethereum Vaults):**
    *   Vaults are explicitly listed in `src/config/protocols.js` under `protocols.yearn.ethereum`.
    *   Currently monitored vaults (from `src/config/protocols.js`):
        *   `ethVault`: `0x19D3364A399d251E894aC732651be8B0E4e85001`
        *   `usdcVault`: `0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE`
        *   `daiVault`: `0xdA816459F1AB5631232FE5e97a05BBBb94970c95`
*   **ABIs:**
    *   `Yearn Vault`: Defined in `src/config/abis.js` as `abis.yearnVault` (human-readable format). Includes `balanceOf`, `pricePerShare`, `decimals`, `token`.
    *   `Underlying Token`: Uses the standard `abis.erc20` defined in `src/config/abis.js` (human-readable format) for fetching symbol and decimals.
*   **Key Functions Used (from `src/services/yearnService.js`):**
    *   From `vaultContract` (`abis.yearnVault`):
        *   `balanceOf(walletAddress)`
        *   `decimals()`
        *   `pricePerShare()`
        *   `token()` (to get the underlying token address)
    *   From `tokenContract` (the underlying ERC20 token of the vault):
        *   `symbol()`
        *   `decimals()`

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v14+ or as specified in `package.json`)
*   NPM or Yarn

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Install dependencies:**
    Navigate to the project directory and run:
    ```bash
    npm install
    # or
    # yarn install
    ```
3.  **Configure environment variables:**
    Create a `.env` file in the root directory of the project. You can copy `.env.example` if one exists (though it seems one doesn't currently) or create the file manually. Add the following variables:

    ```env
    # Required for connecting to Ethereum and Base nodes
    INFURA_KEY=your_infura_key_here

    # Required for fetching token information on Ethereum
    ETHERSCAN_API_KEY=your_etherscan_api_key_here

    # Required for fetching token information on Base
    BASESCAN_API_KEY=your_basescan_api_key_here

    # Optional: Port for the API server (defaults to 3000 if not set)
    # PORT=3000

    # Note: ALCHEMY_KEY was listed in a previous README version, but its usage was not found in the src/ directory.
    # If you know it's required, please add it here.
    # ALCHEMY_KEY=your_alchemy_key_here
    ```

## Usage

Run the tool with a wallet address as an argument:

```bash
npm start 0xYourWalletAddressHere
```

Or with Node directly:

```bash
node src/index.js 0xYourWalletAddressHere
```

## Configuration Files

Details about key configuration files in the `src/config/` directory.

### `chains.js`

*   **Location:** `src/config/chains.js`
*   **Purpose:** Defines the blockchain networks the application can interact with.
*   **Structure:** An object where each key is a lowercase chain identifier (e.g., `ethereum`, `base`) and the value is an object with the following properties:
    *   `name` (String): Human-readable name of the chain (e.g., 'Ethereum Mainnet').
    *   `chainId` (Number): The unique numerical ID of the chain (e.g., 1 for Ethereum).
    *   `rpcUrl` (String): The RPC endpoint URL used to connect to the chain. Can be a template string using environment variables (e.g., `` `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}` ``).
    *   `blockExplorer` (String): The base URL for the chain's block explorer (e.g., 'https://etherscan.io').

**Example Entry:**
```javascript
ethereum: {
  name: 'Ethereum Mainnet',
  chainId: 1,
  rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
  blockExplorer: 'https://etherscan.io'
}
```

### `tokens.js`

*   **Location:** `src/config/tokens.js`
*   **Purpose:** Defines a list of known ERC-20 token addresses for each supported chain. This is used for looking up specific tokens by symbol.
*   **Structure:** An object where each top-level key is a chain identifier (e.g., `ethereum`, `base`), matching those in `chains.js`. The value for each chain is an object where keys are uppercase token symbols (e.g., `USDC`, `WETH`) and values are their corresponding ERC-20 contract addresses on that chain.

**Example Entry (for Ethereum):**
```javascript
ethereum: {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  // ... other tokens
}
```

### `protocols.js`

*   **Location:** `src/config/protocols.js`
*   **Purpose:** Stores protocol-specific contract addresses and other configuration details, organized by protocol and then by chain.
*   **Structure:** An object where top-level keys are protocol names (e.g., `aave`, `lido`, `yearn`). Each protocol object contains chain-specific configurations (e.g., `ethereum`), which in turn hold the relevant contract addresses or other settings for that protocol on that chain.

**Example Entry (Aave on Ethereum):**
```javascript
aave: {
  ethereum: {
    poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    uiPoolDataProvider: '0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC'
  }
}
```

### `abis.js`

*   **Location:** `src/config/abis.js`
*   **Purpose:** Provides a central store for commonly used contract ABIs (Application Binary Interfaces) or partial ABIs.
*   **Structure:** An object where keys are descriptive names for an ABI set (e.g., `erc20`, `aaveUiPoolDataProvider`, `yearnVault`) and values are arrays of human-readable ABI strings (function or event signatures).

**Example Entry (ERC20 ABI):**
```javascript
erc20: [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]
```

## Project Structure

```
/src
  /config       - Configuration files for chains, tokens, protocols, and ABIs
  /services     - Service modules for each protocol and token balances
  /utils        - Utility functions for providers, formatting, caching, etc.
  index.js      - Main entry point
```

## Extending the Project

### Adding New Chains

Add new chain configurations in `src/config/chains.js` and update the token list in `src/config/tokens.js`.

### Adding New Protocols

Create a new service file in the `src/services` directory following the pattern of existing services, then update the `portfolioAggregator.js` to include the new service.

## Future Improvements

- Web interface for better visualization
- Price data integration for USD values
- Historical position tracking
- Additional protocols support


## Example command to test with a specific wallet address:
node src/index.js 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --verbose  