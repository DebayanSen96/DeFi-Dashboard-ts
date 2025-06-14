import { ethers } from 'ethers';
import { chains } from '../config/chains';

let providerCache: Record<string, ethers.providers.JsonRpcProvider> = {};

export function getProvider(chainName: string): ethers.providers.JsonRpcProvider {
  if (providerCache[chainName]) {
    return providerCache[chainName];
  }

  const chain = chains[chainName as keyof typeof chains];
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
  providerCache[chainName] = provider;
  return provider;
}

export function getProviderForChainId(chainId: number): ethers.providers.JsonRpcProvider {
  const chainName = Object.keys(chains).find(
    (key) => chains[key as keyof typeof chains].chainId === chainId
  );

  if (!chainName) {
    throw new Error(`No provider configured for chain ID: ${chainId}`);
  }

  return getProvider(chainName);
}

export async function getNetworkName(provider: ethers.providers.Provider): Promise<string> {
  try {
    const network = await provider.getNetwork();
    return network.name !== 'unknown' ? network.name : `chain-${network.chainId}`;
  } catch (error) {
    console.error('Error getting network name:', error);
    return 'unknown';
  }
}
