import dotenv from 'dotenv';
dotenv.config(); // Load environment variables first

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { tokenService, TokenData } from './services/tokenService';
import { AaveService } from './services/aaveService';
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
  tokens: TokenResponse[];
  totalValue: string;
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
          
          // Calculate total value (simplified - would need price data for real values)
          const totalValue = tokenResponses.reduce((sum, token) => {
            try {
              const balance = parseFloat(ethers.formatUnits(token.balance, token.decimals));
              return sum + (isNaN(balance) ? 0 : balance);
            } catch (e) {
              return sum;
            }
          }, 0);
          
          return {
            chain: chainKey,
            chainName: chain.name,
            tokens: tokenResponses,
            totalValue: totalValue.toString(),
          } as ChainResponse;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing chain ${chainKey}:`, errorMessage);
          return {
            chain: chainKey,
            chainName: chainKey,
            tokens: [],
            totalValue: '0',
            error: `Failed to fetch data: ${errorMessage}`,
          } as ChainResponse;
        }
      })
    );
    
    // Calculate total across all chains
    const totalValue = results.reduce((sum, chainData) => {
      return sum + parseFloat(chainData.totalValue || '0');
    }, 0);
    
    res.json({
      walletAddress,
      chains: results,
      valuation: {
        total: totalValue.toString(),
        byChain: results.reduce<Record<string, string>>((acc, chain) => {
          acc[chain.chain] = chain.totalValue || '0';
          return acc;
        }, {}),
      },
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
    const allProtocols = ['aave', 'lido', 'yearn'] as const;
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
    const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
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
            const yearn = new YearnService(provider, walletAddress);
            positions.yearn = await yearn.getPositions();
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching ${protocol} positions:`, errorMessage);
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
