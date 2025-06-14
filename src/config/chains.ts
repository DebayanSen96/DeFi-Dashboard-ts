interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const chains: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: `https://base-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    explorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
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
    },
  },
} as const;
