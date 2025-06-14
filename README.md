# DeFi Dashboard

A TypeScript-based DeFi portfolio dashboard that tracks token balances and protocol positions across multiple EVM-compatible blockchains.

## Features

- Track token balances across multiple chains (Ethereum, Base, Bittensor, Monad)
- View DeFi protocol positions (Aave, Lido, Yearn)
- REST API for programmatic access
- Command-line interface for quick checks
- Built with TypeScript for type safety

## Prerequisites

- Node.js 16+ and npm
- Infura API key (for Ethereum RPC)
- Etherscan API key
- Basescan API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

## Configuration

Edit the `.env` file with your API keys:

```
INFURA_KEY=your_infura_key_here
ETHERSCAN_API_KEY=your_etherscan_key_here
BASESCAN_API_KEY=your_basescan_key_here
```

## Usage

### CLI Mode

```bash
# Show help
npx ts-node src/index.ts --help

# Check wallet positions
npx ts-node src/index.ts positions 0x1234...

# Check positions on a specific chain
npx ts-node src/index.ts positions 0x1234... --chain base

# Check specific protocols only
npx ts-node src/index.ts positions 0x1234... --protocols aave,lido

# Start the API server
npx ts-node src/index.ts server --port 3000
```

### API Endpoints

- `GET /tokens?walletAddress=<address>&chain=<chain1,chain2>` - Get token balances
- `GET /positions?walletAddress=<address>&protocols=<protocol1,protocol2>` - Get DeFi positions
- `GET /health` - Health check

## Project Structure

```
src/
  config/       # Configuration files (chains, tokens, protocols)
  services/     # Protocol services (Aave, Lido, Yearn)
  types/        # TypeScript type definitions
  utils/        # Utility functions
  index.ts      # CLI entry point
  server.ts     # API server
```

## Development

1. Install development dependencies:
   ```bash
   npm install --save-dev typescript ts-node @types/node @types/express @types/cors
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Run tests (coming soon):
   ```bash
   npm test
   ```

## License

MIT
