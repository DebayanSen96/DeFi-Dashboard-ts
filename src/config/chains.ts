interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
    coingeckoId?: string; // Optional, as not all native currencies are on CoinGecko (e.g., testnets)
  };
}

export const chains: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',  // Public Ethereum RPC
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum', // Price of ETH
    },
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',  // Public Base RPC
    explorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ethereum', // Base uses ETH as its native currency
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum', // Price of ETH
    },
  },
  bittensor: {
    name: 'Bittensor EVM Testnet',
    chainId: 945,
    rpcUrl: 'https://test.chain.opentensor.ai',
    explorerUrl: '',
    nativeCurrency: {
      name: 'Tao',
      symbol: 'TAO',
      decimals: 18,
      coingeckoId: 'bittensor',
    },
  },
  monad: {
    name: 'Monad Testnet',
    chainId: 10143,
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorerUrl: '',
    nativeCurrency: {
      name: 'Monad',
      symbol: 'MON',
      decimals: 18,
      coingeckoId: undefined, // Monad not on CoinGecko yet
    },
  },
} as const;
