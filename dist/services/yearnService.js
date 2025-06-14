"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YearnService = void 0;
const ethers_1 = require("ethers");
const protocols_1 = require("../config/protocols");
const abis_1 = require("../config/abis");
const chains_1 = require("../config/chains");
class YearnService {
    constructor(provider, walletAddress) {
        this.provider = provider;
        this.walletAddress = walletAddress;
    }
    async getPositions() {
        const network = await this.provider.getNetwork();
        const chainId = network.chainId;
        const chainName = Object.keys(chains_1.chains).find((key) => chains_1.chains[key].chainId === chainId);
        if (!chainName || !protocols_1.protocols.yearn[chainName]) {
            throw new Error(`Yearn not supported on chain ${chainId}`);
        }
        const config = protocols_1.protocols.yearn[chainName];
        const positions = [];
        // Process each vault in the config
        for (const [vaultName, vaultAddress] of Object.entries(config.vaults)) {
            const vaultAddr = vaultAddress;
            try {
                const vaultContract = new ethers_1.ethers.Contract(vaultAddr, abis_1.abis.yearnVault, this.provider);
                const [balance, pricePerShare, decimals, tokenAddress, symbol] = await Promise.all([
                    vaultContract.balanceOf(this.walletAddress),
                    vaultContract.pricePerShare(),
                    vaultContract.decimals(),
                    vaultContract.token(),
                    vaultContract.symbol()
                ]);
                if (balance.gt(0)) {
                    const underlyingBalance = balance.mul(pricePerShare).div(ethers_1.ethers.utils.parseUnits('1', decimals));
                    // Get the underlying token info
                    const tokenContract = new ethers_1.ethers.Contract(tokenAddress, abis_1.abis.erc20, this.provider);
                    let tokenSymbol;
                    try {
                        tokenSymbol = await tokenContract.symbol();
                    }
                    catch (e) {
                        console.warn(`Could not get symbol for token ${tokenAddress}:`, e);
                        tokenSymbol = 'UNKNOWN';
                    }
                    positions.push({
                        vaultAddress: vaultAddr,
                        vaultSymbol: symbol,
                        tokenAddress: tokenAddress,
                        tokenSymbol,
                        balance: ethers_1.ethers.utils.formatUnits(balance, decimals),
                        pricePerShare: ethers_1.ethers.utils.formatUnits(pricePerShare, decimals),
                        underlyingBalance: ethers_1.ethers.utils.formatUnits(underlyingBalance, decimals),
                    });
                }
            }
            catch (error) {
                console.error(`Error fetching data for vault ${vaultName} (${vaultAddress}):`, error);
            }
        }
        return positions;
    }
}
exports.YearnService = YearnService;
//# sourceMappingURL=yearnService.js.map