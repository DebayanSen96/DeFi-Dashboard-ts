"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
exports.getProviderForChainId = getProviderForChainId;
exports.getNetworkName = getNetworkName;
const ethers_1 = require("ethers");
const chains_1 = require("../config/chains");
let providerCache = {};
function getProvider(chainName) {
    if (providerCache[chainName]) {
        return providerCache[chainName];
    }
    const chain = chains_1.chains[chainName];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }
    const provider = new ethers_1.ethers.providers.JsonRpcProvider(chain.rpcUrl);
    providerCache[chainName] = provider;
    return provider;
}
function getProviderForChainId(chainId) {
    const chainName = Object.keys(chains_1.chains).find((key) => chains_1.chains[key].chainId === chainId);
    if (!chainName) {
        throw new Error(`No provider configured for chain ID: ${chainId}`);
    }
    return getProvider(chainName);
}
async function getNetworkName(provider) {
    try {
        const network = await provider.getNetwork();
        return network.name !== 'unknown' ? network.name : `chain-${network.chainId}`;
    }
    catch (error) {
        console.error('Error getting network name:', error);
        return 'unknown';
    }
}
//# sourceMappingURL=providers.js.map