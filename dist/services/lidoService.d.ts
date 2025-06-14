import { ethers } from 'ethers';
interface LidoPosition {
    asset: string;
    symbol: string;
    staked: string;
    stakedInEth: string;
    isWrapped: boolean;
}
export declare class LidoService {
    private provider;
    private walletAddress;
    constructor(provider: ethers.providers.JsonRpcProvider, walletAddress: string);
    getPositions(): Promise<LidoPosition[]>;
}
export {};
