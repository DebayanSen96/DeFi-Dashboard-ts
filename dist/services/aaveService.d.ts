import { ethers } from 'ethers';
interface AavePosition {
    asset: string;
    symbol: string;
    supplied: string;
    borrowed: string;
    supplyAPY: string;
    borrowAPY: string;
}
export declare class AaveService {
    private provider;
    private walletAddress;
    constructor(provider: ethers.providers.JsonRpcProvider, walletAddress: string);
    getPositions(): Promise<AavePosition[]>;
}
export {};
