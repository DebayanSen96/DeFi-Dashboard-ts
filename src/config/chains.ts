interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
}

export const chains: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    blockExplorer: 'https://etherscan.io',
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
  },
  bittensor: {
    name: 'Bittensor EVM Testnet',
    chainId: 3637,
    rpcUrl: 'https://testnet.bittensor.com/rpc',
    blockExplorer: 'https://testnet.bittensor.com',
  },
  monad: {
    name: 'Monad Testnet',
    chainId: 52372,
    rpcUrl: 'https://testnet.monad.xyz',
    blockExplorer: 'https://testnet-explorer.monad.xyz',
  },
} as const;
