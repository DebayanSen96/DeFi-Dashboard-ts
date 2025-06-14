import dotenv from 'dotenv';
dotenv.config(); // Load environment variables first

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { tokenService, TokenData } from './services/tokenService';
import { PriceService, PriceTokenInput, PortfolioValuation } from './services/priceService';
import { AaveService } from './services/aaveService';
import { CompoundService } from './services/compoundService';
import { LidoService } from './services/lidoService';
import { YearnService } from './services/yearnService';
import { chains } from './config/chains';
import { tokens } from './config/tokens';
import { ethers, JsonRpcProvider } from 'ethers';
import { ChainConfig } from './types';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Error handling middleware
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
  res.status(500).json({ error: 'Internal server error', message: errorMessage });
});

// Helper to validate wallet address
const isValidAddress = (address: string): boolean => {
  return ethers.isAddress(address);
};

interface TokenResponse {
  address: string;
  balance: string;
  symbol: string;
  name: string;
  decimals: string;
  type: string;
}

interface ChainResponse {
  chain: string;
  chainName: string;
  tokens: PriceTokenInput[]; // Will now include valueUSD
  valuation: {
    totalValueUSD: number;
    valueByChainUSD: Record<string, number>;
  };
  error?: string;
}

// GET /tokens - Fetch token balances across chains
app.get('/tokens', async (req: Request, res: Response) => {
  try {
    const { walletAddress, chain: chainParam } = req.query;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Determine which chains to query
    let targetChains = Object.keys(chains);
    if (chainParam && typeof chainParam === 'string') {
      const requestedChains = chainParam.split(',').map((c: string) => c.trim().toLowerCase());
      targetChains = targetChains.filter(chain => 
        requestedChains.includes(chain.toLowerCase())
      );
      
      if (targetChains.length === 0) {
        return res.status(400).json({ error: 'No valid chains specified' });
      }
    }

    const results = await Promise.all(
      targetChains.map(async (chainKey) => {
        try {
          const chain = chains[chainKey as keyof typeof chains];
          // Dynamic token fetch: ignore static tokens config
          const tokenAddresses: string[] = [];
          
          // Get all token balances (native and ERC20)
          const allTokenBalances = await tokenService.getTokenBalances(chainKey, walletAddress);
          
          // Format response
          const tokenResponses: TokenResponse[] = Object.entries(allTokenBalances).map(([address, data]) => {
            const isNative = address.toLowerCase() === ethers.ZeroAddress.toLowerCase();
            const chainConfig = chains[chainKey as keyof typeof chains];
            
            let symbol = data.info?.symbol || 'UNKNOWN';
            let name = data.info?.tokenName || 'Unknown Token';
            let decimals = data.info?.decimals || '18';
            let type = data.info?.tokenType || 'ERC20';

            if (isNative && chainConfig) {
              symbol = chainConfig.nativeCurrency.symbol;
              name = chainConfig.nativeCurrency.name;
              decimals = chainConfig.nativeCurrency.decimals.toString();
              type = 'NATIVE';
            } else if (isNative) { // Fallback if chainConfig somehow not found, though unlikely
                symbol = data.info?.symbol || chain?.nativeCurrency?.symbol || 'NATIVE';
                name = data.info?.tokenName || chain?.nativeCurrency?.name || 'Native Token';
                decimals = data.info?.decimals || chain?.nativeCurrency?.decimals?.toString() || '18';
                type = 'NATIVE';
            }

            return {
              address,
              balance: data.balance,
              symbol,
              name,
              decimals,
              type,
            };
          });
          
          // Prepare tokens for price calculation
          const tokensForPricing: PriceTokenInput[] = tokenResponses.map(tr => ({
            ...tr,
            chainKey: chainKey,
          }));

          // Calculate portfolio value using PriceService
          const valuation: PortfolioValuation = await PriceService.calculatePortfolioValue(tokensForPricing);

          return {
            chain: chainKey,
            chainName: chain.name,
            tokens: valuation.tokensWithValue, // Use tokens with USD values from PriceService
            valuation: {
              totalValueUSD: valuation.totalValueUSD,
              valueByChainUSD: valuation.valueByChainUSD,
            }
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing chain ${chainKey}:`, errorMessage);
          return {
            chain: chainKey,
            chainName: chains[chainKey as keyof typeof chains].name, // Corrected chain name access
            tokens: [],
            valuation: { // Add empty valuation for error case
              totalValueUSD: 0,
              valueByChainUSD: {},
            },
            error: errorMessage,
          };
        }
      })
    );
    
    // Calculate overall valuation across all chains
    const overallValuation = results.reduce((acc, chainData) => {
      if (chainData.valuation) { // Ensure valuation object exists (it might not in case of an error for a chain)
        acc.totalValueUSD += chainData.valuation.totalValueUSD;
        acc.valueByChainUSD[chainData.chain] = chainData.valuation.totalValueUSD;
      }
      return acc;
    }, { totalValueUSD: 0, valueByChainUSD: {} as Record<string, number> });
    
    res.json({
      walletAddress,
      chains: results,
      valuation: overallValuation
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in /tokens endpoint:', errorMessage);
    res.status(500).json({ error: 'Internal server error', message: errorMessage });
  }
});

// GET /positions - Fetch DeFi protocol positions
app.get('/positions', async (req: Request, res: Response) => {
  try {
    const { walletAddress, protocols: protocolsParam } = req.query;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    // Determine which protocols to query
    const allProtocols = ['aave', 'lido', 'yearn', 'compound'] as const;
    let targetProtocols = [...allProtocols];
    
    if (protocolsParam && typeof protocolsParam === 'string') {
      const requestedProtocols = protocolsParam.split(',').map(p => p.trim().toLowerCase());
      targetProtocols = allProtocols.filter((protocol): protocol is typeof allProtocols[number] =>
        requestedProtocols.includes(protocol as any)
      );
      
      if (targetProtocols.length === 0) {
        return res.status(400).json({ error: 'No valid protocols specified' });
      }
    }
    
    // Initialize protocol services
    const infuraKey = process.env.INFURA_KEY;
    if (!infuraKey) {
      throw new Error('INFURA_KEY is not set in the environment variables. Please check your .env file.');
    }
    const ethereumRpcUrl = `https://mainnet.infura.io/v3/${infuraKey}`;
    const provider = new JsonRpcProvider(ethereumRpcUrl);
    const positions: Record<string, any> = {};
    
    // Fetch positions from each protocol
    for (const protocol of targetProtocols) {
      try {
        switch (protocol) {
          case 'aave': {
            const aave = new AaveService(provider, walletAddress);
            positions.aave = await aave.getPositions();
            break;
          }
          case 'lido': {
            const lido = new LidoService(provider, walletAddress);
            positions.lido = await lido.getPositions();
            break;
          }
          case 'yearn': {
          break;
          }
          case 'compound': {
            const compound = new CompoundService(provider, walletAddress);
            positions.compound = await compound.getPositions();
            break;
          }
          case 'yearn': {
            const yearn = new YearnService(provider, walletAddress);
            positions.yearn = await yearn.getPositions();
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching ${protocol} positions:`, error);
        positions[protocol] = { error: `Failed to fetch ${protocol} positions: ${errorMessage}` };
      }
    }
    
    res.json({
      walletAddress,
      positions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in /positions endpoint:', errorMessage);
    res.status(500).json({ error: 'Internal server error', message: errorMessage });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
const startServer = (): void => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log(`  GET /tokens?walletAddress=<address>&chain=<chain1,chain2>`);
    console.log(`  GET /positions?walletAddress=<address>&protocols=<protocol1,protocol2>`);
    console.log(`  GET /health`);
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('Shutting down server...');
    server.close(() => {
      console.log('Server has been terminated');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server as unknown as void;
};

// Only start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export { app, startServer };
