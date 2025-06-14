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
    const config = {
      baseUrl: '',
      apiKey: '',
    };

    switch (chain.toLowerCase()) {
      case 'ethereum':
        config.baseUrl = 'https://api.etherscan.io/api';
        config.apiKey = process.env.ETHERSCAN_API_KEY || '';
        break;
      case 'base':
        config.baseUrl = 'https://api.basescan.org/api';
        config.apiKey = process.env.BASESCAN_API_KEY || '';
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    if (!config.apiKey) {
      throw new Error(`API key not configured for ${chain}`);
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

  public async getTokenBalances(chain: string, walletAddress: string, tokenAddresses: string[]): Promise<Record<string, TokenData>> {
    const results: Record<string, TokenData> = {};
    
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
        results[tokenAddress] = data;
      });

      // Add a small delay between batches
      if (i + BATCH_SIZE < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  public async getNativeBalance(chain: string, walletAddress: string): Promise<string> {
    const cacheKey = `native_balance_${chain}_${walletAddress}`;
    
    return this.getWithCache(cacheKey, async () => {
      const { baseUrl, apiKey } = this.getApiConfig(chain);
      
      const response = await axios.get<TokenBalanceResponse>(baseUrl, {
        params: {
          module: 'account',
          action: 'balance',
          address: walletAddress,
          tag: 'latest',
          apikey: apiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== '1') {
        throw new Error(`API error: ${response.data.message}`);
      }

      return response.data.result;
    });
  }
}

export const tokenService = TokenService.getInstance();
export type { TokenInfo, TokenData };
