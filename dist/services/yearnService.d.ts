import { ethers } from 'ethers';
interface YearnVaultPosition {
    vaultAddress: string;
    vaultSymbol: string;
    tokenAddress: string;
    tokenSymbol: string;
    balance: string;
    pricePerShare: string;
    underlyingBalance: string;
    apy?: string;
}
export declare class YearnService {
    private provider;
    private walletAddress;
    constructor(provider: ethers.providers.JsonRpcProvider, walletAddress: string);
    getPositions(): Promise<YearnVaultPosition[]>;
}
export {};
