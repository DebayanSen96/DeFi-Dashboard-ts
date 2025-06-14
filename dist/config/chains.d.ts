interface ChainConfig {
    name: string;
    chainId: number;
    rpcUrl: string;
    blockExplorer: string;
}
export declare const chains: Record<string, ChainConfig>;
export {};
