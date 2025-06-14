import axios from 'axios';
import { ethers } from 'ethers';
import { chains } from '../config/chains'; // To get native currency info if needed

// Define input structure for tokens when calculating price
export interface PriceTokenInput {
  address: string;
  balance: string;
  symbol: string;
  name: string;
  decimals: string;
  type: string; // 'NATIVE' | 'ERC20'
  chainKey: string; // e.g., 'ethereum', 'base'
  valueUSD?: number;
}

export interface PortfolioValuation {
  totalValueUSD: number;
  valueByChainUSD: Record<string, number>;
  tokensWithValue: PriceTokenInput[];
}

// Helper to retry requests on rate limit errors or other transient issues
async function fetchWithRetry(
  url: string,
  config?: import('axios').AxiosRequestConfig,
  retries = 3,
  backoff = 1000
): Promise<import('axios').AxiosResponse<any, any>> {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, config);
    } catch (e: any) {
      const status = e.response ? e.response.status : null;
      // Retry on 429 (Too Many Requests) or 5xx server errors
      if (i === retries - 1 || (status !== 429 && (status === null || status < 500))) {
        throw e;
      }
      console.warn(`Request to ${url} failed with status ${status}. Retrying in ${backoff * Math.pow(2, i)}ms...`);
      await new Promise(res => setTimeout(res, backoff * Math.pow(2, i)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`); // Should not be reached if logic is correct
}

export class PriceService {
  private static readonly COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';

  // Map our chain keys to Coingecko platform IDs
  // Note: Base uses Ethereum's token ecosystem, so prices are often found there.
  // Monad is not yet on CoinGecko.
  private static readonly coingeckoPlatformMap: Record<string, string | null> = {
    ethereum: 'ethereum',
    base: 'base-mainnet', // Base has its own platform ID on CoinGecko
    bittensor: 'bittensor', // Assuming 'bittensor' is the platform ID for TAO
    monad: null, // Monad not on CoinGecko
  };

  // Fallback mapping from token symbols to Coingecko IDs for common ERC20 tokens
  // This is used if contract-based lookup fails or for chains without specific platform IDs for all tokens.
  private static readonly symbolToCoingeckoIdFallback: Record<string, string> = {
    LINK: 'chainlink',
    USDC: 'usd-coin',
    USDT: 'tether',
    WETH: 'weth', // Wrapped Ether
    WBTC: 'wrapped-bitcoin',
    DAI: 'dai',
    SHIB: 'shiba-inu', // For the SHIB token on Base from user's example
    // Add other common tokens as needed
  };

  public static async calculatePortfolioValue(
    tokens: PriceTokenInput[]
  ): Promise<PortfolioValuation> {
    const priceMap: Record<string, number> = {}; // Key: 'chainKey|address_or_coingecko_id', Value: USD price
    const valuation: PortfolioValuation = {
      totalValueUSD: 0,
      valueByChainUSD: {},
      tokensWithValue: [],
    };

    // Initialize valueByChainUSD for all chains present in input tokens
    tokens.forEach(token => {
      if (valuation.valueByChainUSD[token.chainKey] === undefined) {
        valuation.valueByChainUSD[token.chainKey] = 0;
      }
    });

    // 1. Fetch prices for native tokens
    const nativeTokenIdentifiers: Record<string, string> = {}; // chainKey: coingeckoId
    for (const token of tokens) {
      if (token.type === 'NATIVE') {
        const chainConfig = chains[token.chainKey as keyof typeof chains];
        if (chainConfig && chainConfig.nativeCurrency.coingeckoId) {
          nativeTokenIdentifiers[token.chainKey] = chainConfig.nativeCurrency.coingeckoId;
        }
      }
    }
    
    const nativeCoingeckoIds = Object.values(nativeTokenIdentifiers).filter(id => id);
    if (nativeCoingeckoIds.length > 0) {
      try {
        const response = await fetchWithRetry(
          `${this.COINGECKO_API_BASE_URL}/simple/price`,
          { params: { ids: nativeCoingeckoIds.join(','), vs_currencies: 'usd' } }
        );
        for (const [chainKey, coingeckoId] of Object.entries(nativeTokenIdentifiers)) {
          if (response.data[coingeckoId] && response.data[coingeckoId].usd) {
            priceMap[`${chainKey}|${coingeckoId}`] = response.data[coingeckoId].usd;
          }
        }
      } catch (error: any) {
        console.error('Error fetching native token prices from CoinGecko:', error.message);
      }
    }

    // 2. Fetch prices for ERC20 tokens by contract address per chain
    const erc20TokensByChain: Record<string, { address: string; chainKey: string }[]> = {};
    tokens.forEach(token => {
      if (token.type !== 'NATIVE' && ethers.isAddress(token.address) && this.coingeckoPlatformMap[token.chainKey]) {
        if (!erc20TokensByChain[token.chainKey]) {
          erc20TokensByChain[token.chainKey] = [];
        }
        erc20TokensByChain[token.chainKey].push({ address: token.address.toLowerCase(), chainKey: token.chainKey });
      }
    });

    for (const chainKey of Object.keys(erc20TokensByChain)) {
      const platformId = this.coingeckoPlatformMap[chainKey];
      if (!platformId) continue;

      const addresses = erc20TokensByChain[chainKey].map(t => t.address);
      if (addresses.length === 0) continue;

      const BATCH_SIZE = 50; // CoinGecko API limitation
      for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        try {
          const response = await fetchWithRetry(
            `${this.COINGECKO_API_BASE_URL}/simple/token_price/${platformId}`,
            { params: { contract_addresses: batch.join(','), vs_currencies: 'usd' } }
          );
          for (const [contractAddress, data] of Object.entries(response.data as Record<string, { usd: number }>)) {
            if (data && data.usd !== undefined) {
              priceMap[`${chainKey}|${contractAddress.toLowerCase()}`] = data.usd;
            }
          }
        } catch (error: any) {
          console.error(`Error fetching ERC20 token prices for ${chainKey} (batch starting ${batch[0]}):`, error.message);
        }
      }
    }

    // 3. Calculate values and apply fallbacks
    for (const token of tokens) {
      let price = 0;
      const chainConfig = chains[token.chainKey as keyof typeof chains];

      if (token.type === 'NATIVE' && chainConfig?.nativeCurrency.coingeckoId) {
        price = priceMap[`${token.chainKey}|${chainConfig.nativeCurrency.coingeckoId}`] || 0;
      } else if (ethers.isAddress(token.address)) {
        price = priceMap[`${token.chainKey}|${token.address.toLowerCase()}`] || 0;
        // Symbol-based fallback if contract address price is not found
        if (price === 0 && this.symbolToCoingeckoIdFallback[token.symbol.toUpperCase()]) {
          const fallbackId = this.symbolToCoingeckoIdFallback[token.symbol.toUpperCase()];
          // Check if we already fetched this fallback ID (could be a shared native ID like 'ethereum' for WETH)
          if (priceMap[`${token.chainKey}|${fallbackId}`]) {
             price = priceMap[`${token.chainKey}|${fallbackId}`];
          } else {
            // Fetch if not already in map (less efficient, but a fallback)
            try {
              const response = await fetchWithRetry(
                `${this.COINGECKO_API_BASE_URL}/simple/price`,
                { params: { ids: fallbackId, vs_currencies: 'usd' } }
              );
              if (response.data[fallbackId] && response.data[fallbackId].usd) {
                price = response.data[fallbackId].usd;
                priceMap[`${token.chainKey}|${fallbackId}`] = price; // Cache for potential reuse
              }
            } catch (error: any) {
              console.warn(`CoinGecko symbol fallback fetch error for ${token.symbol} (${fallbackId}):`, error.message);
            }
          }
        }
      }

      const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals));
      const valueUSD = balance * price;
      
      const valuedToken = { ...token, valueUSD };
      valuation.tokensWithValue.push(valuedToken);
      valuation.valueByChainUSD[token.chainKey] = (valuation.valueByChainUSD[token.chainKey] || 0) + valueUSD;
      valuation.totalValueUSD += valueUSD;
    }
    return valuation;
  }
}
