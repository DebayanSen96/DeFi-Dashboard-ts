import { providers } from 'ethers';

export interface ChainConfig {
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

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  chainId: number;
}

export interface TokenBalance {
  balance: string;
  info?: TokenInfo;
}

export interface TokenBalances {
  [tokenAddress: string]: TokenBalance;
}

export interface Position {
  protocol: string;
  chain: string;
  tokens: TokenInfo[];
  balances: TokenBalances;
  healthFactor?: number;
  apy?: number;
  rewards?: {
    token: TokenInfo;
    amount: string;
    apy: number;
  }[];
}

export interface TokenService {
  getTokenInfo(chain: string, tokenAddress: string): Promise<TokenInfo | null>;
  getTokenBalances(chain: string, walletAddress: string, tokenAddresses: string[]): Promise<TokenBalances>;
  getNativeBalance(chain: string, walletAddress: string): Promise<string>;
}

export interface ProtocolService {
  getPositions(walletAddress: string, provider: providers.JsonRpcProvider): Promise<Position[]>;
}

export interface TokenData {
  balance: string;
  info?: {
    symbol: string;
    tokenName: string;
    tokenType: string;
    decimals: string;
  };
}
