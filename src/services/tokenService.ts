import axios from 'axios';
import { JsonRpcProvider, id, ZeroAddress } from 'ethers';
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
  private readonly etherscanApiKey?: string;
  private readonly basescanApiKey?: string;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    console.log('[TokenService Constructor] ETHERSCAN_API_KEY:', process.env.ETHERSCAN_API_KEY);
    console.log('[TokenService Constructor] BASESCAN_API_KEY:', process.env.BASESCAN_API_KEY);
    this.etherscanApiKey = process.env.ETHERSCAN_API_KEY;
    this.basescanApiKey = process.env.BASESCAN_API_KEY;
  }

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

  public async getTokenBalances(chain: string, walletAddress: string): Promise<Record<string, TokenData>> {
    const result: Record<string, TokenData> = {};
    const chainLower = chain.toLowerCase();
    let discoveredTokens: { address: string; symbol: string; decimals: number }[] = [];

    try {
      const config = this.getApiConfig(chain);
      
      // Discover tokens using block explorer API ('tokentx')
      if (config.baseUrl && config.apiKey) {
        try {
          const txResponse = await axios.get<any>(config.baseUrl, {
            params: {
              module: 'account',
              action: 'tokentx',
              address: walletAddress,
              startblock: 0,
              endblock: 99999999,
              sort: 'asc',
              apikey: config.apiKey,
            },
            timeout: 10000,
          });
          if (txResponse.data.status === '1' && Array.isArray(txResponse.data.result)) {
            const uniqueTokenMap = new Map<string, { address: string; symbol: string; decimals: number }>();
            for (const tx of txResponse.data.result) {
              const tokenAddress = tx.contractAddress.toLowerCase();
              if (tokenAddress && tokenAddress !== ZeroAddress.toLowerCase() && !uniqueTokenMap.has(tokenAddress)) {
                uniqueTokenMap.set(tokenAddress, {
                  address: tokenAddress,
                  symbol: tx.tokenSymbol,
                  decimals: parseInt(tx.tokenDecimal, 10),
                });
              }
            }
            discoveredTokens = Array.from(uniqueTokenMap.values()).filter(token => token.address.toLowerCase() !== ZeroAddress.toLowerCase());
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`Error fetching token list for ${chain}: ${errMsg}`);
        }
      }
      
      // Always fetch native token balance first
      try {
        const nativeBalance = await this.getNativeBalance(chain, walletAddress);
        result['native'] = nativeBalance;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching native balance for ${chain}:`, errorMessage);
      }
      
      
      
      // Process discovered tokens in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < discoveredTokens.length; i += BATCH_SIZE) {
        const batch = discoveredTokens.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (token) => {
          try {
            const balance = await this.getTokenBalance(chain, walletAddress, token.address);
            // Token info (name, symbol, decimals) is already partially available from tokentx
            // We can augment it or use it directly if getTokenInfo fails or is redundant
            let info: TokenInfo | null = {
                contractAddress: token.address,
                tokenName: token.symbol, // Placeholder, getTokenInfo might provide a fuller name
                symbol: token.symbol,
                decimals: token.decimals.toString(),
                tokenType: 'erc20'
            };
            try {
                const moreInfo = await this.getTokenInfo(chain, token.address);
                if (moreInfo) info = moreInfo;
            } catch (infoError) {
                console.warn(`Could not fetch detailed info for ${token.symbol} (${token.address}), using basic info.`);
            }
            return { tokenAddress: token.address, data: { balance, info } };
          } catch (error) {
            console.error(`Error fetching data for token ${token.symbol} (${token.address}):`, error);
            return { tokenAddress: token.address, data: { balance: '0', info: null } };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        // Merge batch results
        batchResults.forEach(({ tokenAddress, data }) => {
          result[tokenAddress] = data;
        });

        // Add a small delay between batches
        if (i + BATCH_SIZE < discoveredTokens.length) {
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

  public async getNativeBalance(chainKey: string, walletAddress: string): Promise<TokenData> {
    const config = this.getApiConfig(chainKey);
    const cacheKey = `native_${chainKey}_${walletAddress}`;
    
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
            const chainConfig = chains[chainKey as keyof typeof chains];
            if (!chainConfig) {
              throw new Error(`Unsupported chain: ${chainKey}`);
            }
            return {
              balance: response.data.result,
              info: {
                symbol: chainConfig.nativeCurrency.symbol,
                tokenName: chainConfig.nativeCurrency.name,
                decimals: chainConfig.nativeCurrency.decimals.toString(),
                tokenType: 'NATIVE',
                contractAddress: ZeroAddress // Native token represented by ZeroAddress
              }
            };
          }
          console.warn(`Failed to fetch native balance from explorer: ${response.data.message}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn(`API key for ${chainKey} not configured. Cannot fetch native balance via API.`);
        }
      }
      
      // Fallback to RPC if API key is missing or API call fails for native balance
      const provider = new JsonRpcProvider(chains[chainKey as keyof typeof chains].rpcUrl);
      const balance = await provider.getBalance(walletAddress);
      const chainConfig = chains[chainKey as keyof typeof chains];
      if (!chainConfig) {
        throw new Error(`Unsupported chain: ${chainKey}`);
      }
      return {
        balance: balance.toString(),
        info: {
          symbol: chainConfig.nativeCurrency.symbol,
          tokenName: chainConfig.nativeCurrency.name,
          decimals: chainConfig.nativeCurrency.decimals.toString(),
          tokenType: 'NATIVE',
          contractAddress: ZeroAddress // Native token represented by ZeroAddress
        }
      };
    });
  }
}

export const tokenService = TokenService.getInstance();
export type { TokenInfo, TokenData };
