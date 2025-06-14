import axios from 'axios';
import { ethers } from 'ethers';
import { protocols } from '../config/protocols';
import { chains } from '../config/chains';
import { abis } from '../config/abis';

interface TokenInfo {
  contractAddress: string;
  tokenName: string;
  symbol: string;
  decimals: string;
  tokenType: string;
}

interface TokenBalanceResponse {
  status: string;
  message: string;
  result: string;
}

interface TokenInfoResponse {
  status: string;
  message: string;
  result: TokenInfo[];
}

interface TokenData {
  balance: string;
  info: TokenInfo | null;
}

class TokenService {
  private static instance: TokenService;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  private getApiConfig(chain: string) {
    const chainLower = chain.toLowerCase();
    const chainConfig = chains[chainLower as keyof typeof chains];
    
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const config = {
      baseUrl: '',
      apiKey: '',
      rpcUrl: chainConfig.rpcUrl,
      nativeToken: chainConfig.nativeCurrency.symbol,
      nativeDecimals: chainConfig.nativeCurrency.decimals,
      chainId: chainConfig.chainId
    };

    // Configure block explorer APIs for supported chains
    switch (chainLower) {
      case 'ethereum':
        config.baseUrl = 'https://api.etherscan.io/api';
        config.apiKey = process.env.ETHERSCAN_API_KEY || '';
        break;
      case 'base':
        config.baseUrl = 'https://api.basescan.org/api';
        config.apiKey = process.env.BASESCAN_API_KEY || '';
        break;
      // Bittensor and Monad will only use RPC
    }

    // Only require API key for chains that use block explorers
    if ((chainLower === 'ethereum' || chainLower === 'base') && !config.apiKey) {
      console.warn(`API key not configured for ${chain}, falling back to RPC only`);
    }

    return config;
  }

  private async getWithCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    
    if (cached && cached.expiry > now) {
      return cached.data;
    }

    const data = await this.withRetry(fetchFn);
    this.cache.set(key, { data, expiry: now + this.CACHE_TTL });
    return data;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) break;
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Unknown error in withRetry');
  }

  public async getTokenBalance(chain: string, walletAddress: string, tokenAddress: string): Promise<string> {
    const cacheKey = `balance_${chain}_${walletAddress}_${tokenAddress}`;
    
    return this.getWithCache(cacheKey, async () => {
      const { baseUrl, apiKey } = this.getApiConfig(chain);
      
      const response = await axios.get<TokenBalanceResponse>(baseUrl, {
        params: {
          module: 'account',
          action: 'tokenbalance',
          address: walletAddress,
          contractaddress: tokenAddress,
          tag: 'latest',
          apikey: apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.data.status !== '1') {
        throw new Error(`API error: ${response.data.message}`);
      }

      return response.data.result;
    });
  }

  public async getTokenInfo(chain: string, tokenAddress: string): Promise<TokenInfo | null> {
    const cacheKey = `tokenInfo_${chain}_${tokenAddress}`;
    
    return this.getWithCache(cacheKey, async () => {
      const { baseUrl, apiKey } = this.getApiConfig(chain);
      
      const response = await axios.get<TokenInfoResponse>(
        `${baseUrl}?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=${apiKey}`,
        { timeout: 10000 }
      );

      if (response.data.status !== '1' || !response.data.result.length) {
        console.warn(`No token info found for ${tokenAddress} on ${chain}`);
        return null;
      }

      return response.data.result[0];
    });
  }

  public async getTokenBalances(chain: string, walletAddress: string, tokenAddresses: string[] = []): Promise<Record<string, TokenData>> {
    const result: Record<string, TokenData> = {};
    
    try {
      const config = this.getApiConfig(chain);
      
      // Always fetch native token balance first
      try {
        const nativeBalance = await this.getNativeBalance(chain, walletAddress);
        result['native'] = {
          balance: nativeBalance,
          info: {
            contractAddress: '0x0000000000000000000000000000000000000000',
            tokenName: config.nativeToken,
            symbol: config.nativeToken,
            decimals: config.nativeDecimals.toString(),
            tokenType: 'native'
          }
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching native balance for ${chain}:`, errorMessage);
      }
      
      // Skip token fetching for non-supported chains or if no API key
      if (!config.baseUrl || !config.apiKey) {
        return result;
      }
      
      // Process in batches to avoid rate limiting
      const BATCH_SIZE = 10;
      for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
        const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (tokenAddress) => {
          try {
            const [balance, info] = await Promise.all([
              this.getTokenBalance(chain, walletAddress, tokenAddress),
              this.getTokenInfo(chain, tokenAddress)
            ]);
            
            return { tokenAddress, data: { balance, info } };
          } catch (error) {
            console.error(`Error fetching data for token ${tokenAddress}:`, error);
            return { tokenAddress, data: { balance: '0', info: null } };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        // Merge batch results
        batchResults.forEach(({ tokenAddress, data }) => {
          result[tokenAddress] = data;
        });

        // Add a small delay between batches
        if (i + BATCH_SIZE < tokenAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error fetching token balances for ${chain}:`, errorMessage);
      return {};
    }
  }

  public async getNativeBalance(chain: string, walletAddress: string): Promise<string> {
    const config = this.getApiConfig(chain);
    const cacheKey = `native_${chain}_${walletAddress}`;
    
    return this.getWithCache(cacheKey, async () => {
      // For EVM chains with block explorer support, fetch token balances
      if (config.baseUrl && config.apiKey) {
        try {
          const response = await axios.get(config.baseUrl, {
            params: {
              module: 'account',
              action: 'balance',
              address: walletAddress,
              tag: 'latest',
              apikey: config.apiKey,
            },
          });

          if (response.data.status === '1') {
            return response.data.result;
          }
          console.warn(`Failed to fetch native balance from explorer: ${response.data.message}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn(`Error fetching native balance from explorer: ${errorMessage}`);
        }
      }

      // Fallback to direct RPC call for all chains
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const balance = await provider.getBalance(walletAddress);
        return balance.toString();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to fetch native balance via RPC: ${errorMessage}`);
        throw new Error(`Failed to fetch native balance: ${errorMessage}`);
      }
    });
  }
}

export const tokenService = TokenService.getInstance();
export type { TokenInfo, TokenData };
