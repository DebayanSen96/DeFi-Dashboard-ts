#!/usr/bin/env node

import 'dotenv/config';
import { ethers } from 'ethers';
import { getProvider } from './utils/providers';
import { AaveService } from './services/aaveService';
import { LidoService } from './services/lidoService';
import { YearnService } from './services/yearnService';
import { chains } from './config/chains';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: npm start <wallet-address> [chain]');
    console.log('\nSupported chains:');
    Object.entries(chains).forEach(([key, chain]) => {
      console.log(`  ${key.padEnd(15)} - ${chain.name} (Chain ID: ${chain.chainId})`);
    });
    process.exit(0);
  }

  const walletAddress = args[0];
  const chainName = args[1] || 'ethereum';

  if (!ethers.utils.isAddress(walletAddress)) {
    console.error('Error: Invalid wallet address');
    process.exit(1);
  }

  if (!chains[chainName as keyof typeof chains]) {
    console.error(`Error: Unsupported chain '${chainName}'. Use --help to see supported chains.`);
    process.exit(1);
  }

  try {
    const provider = getProvider(chainName);
    console.log(`\nFetching DeFi positions for ${walletAddress} on ${chains[chainName as keyof typeof chains].name}...\n`);

    // Fetch and display AAVE positions
    try {
      const aaveService = new AaveService(provider, walletAddress);
      const aavePositions = await aaveService.getPositions();
      
      if (aavePositions.length > 0) {
        console.log('=== AAVE POSITIONS ===');
        console.table(aavePositions.map(p => ({
          Asset: p.symbol,
          Supplied: p.supplied,
          Borrowed: p.borrowed,
          'Supply APY': `${p.supplyAPY}%`,
          'Borrow APY': `${p.borrowAPY}%`
        })));
      }
    } catch (error) {
      console.error('Error fetching AAVE positions:', error instanceof Error ? error.message : String(error));
    }

    // Fetch and display LIDO positions
    try {
      const lidoService = new LidoService(provider, walletAddress);
      const lidoPositions = await lidoService.getPositions();
      
      if (lidoPositions.length > 0) {
        console.log('\n=== LIDO STAKING ===');
        console.table(lidoPositions.map(p => ({
          Asset: p.symbol,
          Staked: p.staked,
          'Staked in ETH': p.stakedInEth,
          Type: p.isWrapped ? 'Wrapped (wstETH)' : 'Direct (stETH)'
        })));
      }
    } catch (error) {
      console.error('\nError fetching LIDO positions:', error instanceof Error ? error.message : String(error));
    }

    // Fetch and display YEARN positions
    try {
      const yearnService = new YearnService(provider, walletAddress);
      const yearnPositions = await yearnService.getPositions();
      
      if (yearnPositions.length > 0) {
        console.log('\n=== YEARN VAULTS ===');
        console.table(yearnPositions.map(p => ({
          Vault: p.vaultSymbol,
          'Underlying': p.tokenSymbol,
          'Vault Balance': p.balance,
          'Underlying Value': p.underlyingBalance,
          'Price per Share': p.pricePerShare
        })));
      }
    } catch (error) {
      console.error('\nError fetching Yearn positions:', error instanceof Error ? error.message : String(error));
    }

  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);