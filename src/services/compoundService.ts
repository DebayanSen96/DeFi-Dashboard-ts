import { ethers, JsonRpcProvider, Contract } from 'ethers';
import { protocols } from '../config/protocols';
import { abis } from '../config/abis';
import { chains } from '../config/chains';
import { multicall, Multicall } from '../utils/multicall';

export interface CompoundPosition {
  protocol: string;
  chain: string;
  asset: string;
  assetAddress: string;
  supplied: string;
  borrowed: string;
  supplyAPY: string;
  borrowAPY: string;
}

export class CompoundService {
  private provider: JsonRpcProvider;
  private walletAddress: string;
  
  constructor(provider: JsonRpcProvider, walletAddress: string) {
    this.provider = provider;
    this.walletAddress = walletAddress;
  }

  async getPositions(): Promise<CompoundPosition[]> {
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId);
    const chainName = Object.entries(chains).find(
      ([, chain]) => chain.chainId === chainId
    )?.[0] as keyof typeof chains | undefined;

    if (!chainName || !protocols.compound[chainName]) {
      console.log(`Compound not supported on chain ${chainId}`);
      return [];
    }

    const config = protocols.compound[chainName];
    const positions: CompoundPosition[] = [];

    try {
      const chainKey = chainName?.toLowerCase() === 'ethereum' ? 'ethereum' : 'base' as const;
      
      // Get all markets from comptroller
      const comptroller = new Contract(
        config.comptroller,
        abis.compoundComptroller,
        this.provider
      );
      
      const markets = await comptroller.getAllMarkets();
      
      // Prepare all the contract calls
      const calls = [];
      const cTokenData = [];
      
      for (const cTokenAddress of markets) {
        const cToken = new Contract(cTokenAddress, abis.cToken, this.provider);
        
        calls.push(
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'balanceOf', 
            params: [this.walletAddress],
            allowFailure: true
          },
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'borrowBalanceStored', 
            params: [this.walletAddress],
            allowFailure: true
          },
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'exchangeRateStored',
            allowFailure: true
          },
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'symbol',
            allowFailure: true
          },
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'decimals',
            allowFailure: true
          },
          { 
            target: cTokenAddress, 
            abi: abis.cToken, 
            functionName: 'underlying',
            allowFailure: true
          }
        );
        
        cTokenData.push({
          address: cTokenAddress,
          contract: cToken
        });
      }
      
      // Execute all calls in a single batch
      const multicallInstance = new Multicall(this.provider, chainKey);
      const results = await multicallInstance.batchCall(calls);
      
      // Process results in batches of 6 (one batch per cToken)
      const batchSize = 6;
      for (let i = 0; i < cTokenData.length; i++) {
        const batchIndex = i * batchSize;
        const batchResults = results.slice(batchIndex, batchIndex + batchSize);
        
        // Skip if any call in the batch failed
        if (batchResults.some((result: any) => !result?.success)) {
          continue;
        }
        
        const suppliedCall = batchResults[0] as any;
const borrowedCall = batchResults[1] as any;
const exchangeRateCall = batchResults[2] as any;
const symbolCall = batchResults[3] as any;
const decimalsCall = batchResults[4] as any;
const underlyingAddrCall = batchResults[5] as any;

const suppliedCToken = suppliedCall.data?.[0];
const borrowed = borrowedCall.data?.[0];
const exchangeRate = exchangeRateCall.data?.[0];
const symbol = symbolCall.data?.[0];
const decimals = decimalsCall.data?.[0];
const underlyingAddress = underlyingAddrCall.data?.[0];
        
        // Skip if no balance
        const hasSupply = typeof suppliedCToken === 'bigint' && suppliedCToken > 0n;
        const hasBorrow = typeof borrowed === 'bigint' && borrowed > 0n;
        
        if (!hasSupply && !hasBorrow) {
          continue;
        }
        
        // Handle cETH special case
        const cTokenAddress = cTokenData[i].address.toLowerCase();
        let assetSymbol = symbol;
        let assetAddress = underlyingAddress;
        
        if (cTokenAddress === '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5') {
          assetSymbol = 'ETH';
          assetAddress = '0x0000000000000000000000000000000000000000';
        }
        
        // Calculate underlying balance
        const underlyingBalance = hasSupply && exchangeRate 
          ? BigInt(suppliedCToken.toString()) * BigInt(exchangeRate.toString()) / (10n ** 18n)
          : 0n;
        
        positions.push({
          protocol: 'compound',
          chain: chainName,
          asset: assetSymbol || 'UNKNOWN',
          assetAddress: assetAddress || '0x0000000000000000000000000000000000000000',
          supplied: this.formatTokenBalance(underlyingBalance.toString(), Number(decimals) || 18),
          borrowed: this.formatTokenBalance(hasBorrow ? borrowed.toString() : '0', Number(decimals) || 18),
          supplyAPY: '0',
          borrowAPY: '0'
        });
      }
    } catch (error) {
      console.error('Error in CompoundService.getPositions:', error);
    }

    return positions;
  }

  private formatTokenBalance(balance: string, decimals: number): string {
    return ethers.formatUnits(balance, decimals);
  }
}
