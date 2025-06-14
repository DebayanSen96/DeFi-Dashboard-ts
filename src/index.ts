#!/usr/bin/env node

import { Command } from 'commander';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { startServer } from './server';
import { AaveService } from './services/aaveService';
import { LidoService } from './services/lidoService';
import { YearnService } from './services/yearnService';
import { getProvider } from './utils/providers';
import { protocols } from './config/protocols';
import { chains } from './config/chains';
import { ChainConfig } from './types';

// Load environment variables from .env file in project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Check for required environment variables
const requiredEnvVars = ['INFURA_KEY', 'ETHERSCAN_API_KEY', 'BASESCAN_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error(`Please create a .env file in the project root based on .env.example`);
  process.exit(1);
}

// Initialize CLI
const program = new Command();
program
  .name('defi-dashboard')
  .description('CLI for DeFi Portfolio Dashboard')
  .version('1.0.0');

// Command: Check wallet positions
program
  .command('positions <walletAddress>')
  .description('Fetch DeFi positions for a wallet')
  .option('-c, --chain <chain>', 'Blockchain to query (default: ethereum)', 'ethereum')
  .option('-p, --protocols <protocols>', 'Comma-separated list of protocols to check (aave,lido,yearn)')
  .action(async (walletAddress: string, options: { chain: string; protocols?: string }) => {
    const chainName = options.chain.toLowerCase();
    
    // Validate wallet address
    if (!ethers.isAddress(walletAddress)) {
      console.error('Error: Invalid wallet address');
      process.exit(1);
    }

    // Validate chain
    if (!Object.keys(chains).includes(chainName)) {
      console.error(`Error: Unsupported chain '${chainName}'. Supported chains: ${Object.keys(chains).join(', ')}`);
      process.exit(1);
    }

    const chainConfig = chains[chainName as keyof typeof chains];
    console.log(`\nFetching DeFi positions for ${walletAddress} on ${chainConfig.name}...\n`);

    const provider = getProvider(chainName);
    let targetProtocols = ['aave', 'lido', 'yearn'];
    
    // Filter protocols if specified
    if (options.protocols) {
      const requestedProtocols = options.protocols.split(',').map((p: string) => p.trim().toLowerCase());
      targetProtocols = targetProtocols.filter(p => requestedProtocols.includes(p));
      
      if (targetProtocols.length === 0) {
        console.error('Error: No valid protocols specified');
        process.exit(1);
      }
    }

    try {
      // Get AAVE positions
      if (targetProtocols.includes('aave') && protocols.aave[chainName as keyof typeof protocols.aave]) {
        console.log('=== AAVE POSITIONS ===');
        const aaveService = new AaveService(provider, walletAddress);
        const aavePositions = await aaveService.getPositions();
        
        if (aavePositions && aavePositions.length > 0) {
          console.table(aavePositions);
        } else {
          console.log('No AAVE positions found\n');
        }
      }
      
      // Get Lido positions (only on Ethereum)
      if (targetProtocols.includes('lido') && chainName === 'ethereum' && protocols.lido.ethereum) {
        console.log('=== LIDO POSITIONS ===');
        const lidoService = new LidoService(provider, walletAddress);
        const lidoPositions = await lidoService.getPositions();
        
        if (lidoPositions && lidoPositions.length > 0) {
          console.table(lidoPositions);
        } else {
          console.log('No Lido positions found\n');
        }
      }

      // Get Yearn positions (only on Ethereum)
      if (targetProtocols.includes('yearn') && chainName === 'ethereum' && protocols.yearn.ethereum) {
        console.log('=== YEARN POSITIONS ===');
        const yearnService = new YearnService(provider, walletAddress);
        const yearnPositions = await yearnService.getPositions();
        
        if (yearnPositions && yearnPositions.length > 0) {
          console.table(yearnPositions.map(p => ({
            Vault: p.vaultSymbol,
            'Underlying': p.tokenSymbol,
            'Vault Balance': p.balance,
            'Underlying Value': p.underlyingBalance,
            'Price per Share': p.pricePerShare
          })));
        } else {
          console.log('No Yearn positions found\n');
        }
      }
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : 'An unknown error occurred');
      process.exit(1);
    }
  });

// Start the server
program
  .command('server')
  .description('Start the DeFi Dashboard API server')
  .option('-p, --port <port>', 'Port to run the server on', '3000')
  .action((options: { port: string }) => {
    process.env.PORT = options.port;
    startServer();
  });

// Show help if no arguments
if (process.argv.length <= 2) {
  program.help();
}

// Parse command line arguments
program.parse(process.argv);