"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LidoService = void 0;
const ethers_1 = require("ethers");
const protocols_1 = require("../config/protocols");
const abis_1 = require("../config/abis");
const chains_1 = require("../config/chains");
class LidoService {
    constructor(provider, walletAddress) {
        this.provider = provider;
        this.walletAddress = walletAddress;
    }
    async getPositions() {
        const network = await this.provider.getNetwork();
        const chainId = network.chainId;
        const chainName = Object.keys(chains_1.chains).find((key) => chains_1.chains[key].chainId === chainId);
        if (!chainName || !protocols_1.protocols.lido[chainName]) {
            throw new Error(`Lido not supported on chain ${chainId}`);
        }
        const config = protocols_1.protocols.lido[chainName];
        const positions = [];
        // Check stETH balance
        const stEthContract = new ethers_1.ethers.Contract(config.stETH, abis_1.abis.lidoStEth, this.provider);
        const stEthSymbol = await stEthContract.symbol();
        const stEthDecimals = await stEthContract.decimals();
        const stEthShares = await stEthContract.sharesOf(this.walletAddress);
        const stEthBalance = await stEthContract.getPooledEthByShares(stEthShares);
        if (stEthShares.gt(0)) {
            positions.push({
                asset: config.stETH,
                symbol: stEthSymbol,
                staked: ethers_1.ethers.utils.formatUnits(stEthBalance, stEthDecimals),
                stakedInEth: ethers_1.ethers.utils.formatUnits(stEthBalance, stEthDecimals),
                isWrapped: false,
            });
        }
        // Check wstETH balance
        const wstEthContract = new ethers_1.ethers.Contract(config.wstETH, abis_1.abis.erc20, this.provider);
        const wstEthSymbol = await wstEthContract.symbol();
        const wstEthDecimals = await wstEthContract.decimals();
        const wstEthBalance = await wstEthContract.balanceOf(this.walletAddress);
        if (wstEthBalance.gt(0)) {
            // For wstETH, we'll just show the wrapped amount
            // In a real implementation, you might want to convert wstETH to stETH and then to ETH
            positions.push({
                asset: config.wstETH,
                symbol: wstEthSymbol,
                staked: ethers_1.ethers.utils.formatUnits(wstEthBalance, wstEthDecimals),
                stakedInEth: '0', // Would need price oracle to convert to ETH
                isWrapped: true,
            });
        }
        return positions;
    }
}
exports.LidoService = LidoService;
//# sourceMappingURL=lidoService.js.map