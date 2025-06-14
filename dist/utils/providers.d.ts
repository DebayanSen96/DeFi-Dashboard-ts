import { ethers } from 'ethers';
export declare function getProvider(chainName: string): ethers.providers.JsonRpcProvider;
export declare function getProviderForChainId(chainId: number): ethers.providers.JsonRpcProvider;
export declare function getNetworkName(provider: ethers.providers.Provider): Promise<string>;
