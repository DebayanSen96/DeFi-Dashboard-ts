"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AaveService = void 0;
const ethers_1 = require("ethers");
const protocols_1 = require("../config/protocols");
const abis_1 = require("../config/abis");
const chains_1 = require("../config/chains");
class AaveService {
    constructor(provider, walletAddress) {
        this.provider = provider;
        this.walletAddress = walletAddress;
    }
    async getPositions() {
        const network = await this.provider.getNetwork();
        const chainId = network.chainId;
        const chainName = Object.keys(chains_1.chains).find((key) => chains_1.chains[key].chainId === chainId);
        if (!chainName || !protocols_1.protocols.aave[chainName]) {
            console.log(`Aave not supported on chain ${chainId}`);
            return [];
        }
        const config = protocols_1.protocols.aave[chainName];
        const positions = [];
        try {
            // Get the Pool contract
            const poolContract = new ethers_1.ethers.Contract(config.poolAddressesProvider, [
                'function getPool() view returns (address)',
            ], this.provider);
            // Get the pool address
            const poolAddress = await poolContract.getPool();
            // Get the Pool contract with the correct ABI
            const pool = new ethers_1.ethers.Contract(poolAddress, [
                'function getReserveData(address asset) view returns (tuple(uint256,uint128,uint128,uint128,uint128,uint128,uint40,address,address,address,address,address,uint8) memory)',
                'function getUserAccountData(address user) view returns (uint256,uint256,uint256,uint256,uint256,uint256)'
            ], this.provider);
            // Get the list of all reserves from the AAVE V3 Pool Data Provider
            const aavePoolDataProvider = new ethers_1.ethers.Contract('0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3', // AAVE V3 Pool Data Provider
            [
                'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
                'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)'
            ], this.provider);
            // Get all reserves and filter out problematic ones
            let allReserves = [];
            try {
                allReserves = await aavePoolDataProvider.getAllReservesTokens();
                // Filter out zero addresses and invalid tokens
                allReserves = allReserves.filter((reserve) => reserve.tokenAddress &&
                    reserve.tokenAddress !== ethers_1.ethers.constants.AddressZero);
            }
            catch (error) {
                console.error('Error fetching AAVE reserves:', error);
                return [];
            }
            // Process each reserve in parallel with error handling
            const reservePromises = allReserves.map(async (reserve) => {
                const asset = reserve.tokenAddress;
                // Skip zero address or invalid tokens
                if (!asset || asset === ethers_1.ethers.constants.AddressZero) {
                    return null;
                }
                try {
                    // Get reserve data
                    const reserveData = await pool.getReserveData(asset);
                    // Skip if reserve data is invalid
                    if (!reserveData || !reserveData[7] || !reserveData[8] || !reserveData[9]) {
                        console.warn(`Skipping reserve with invalid data: ${reserve.symbol} (${asset})`);
                        return null;
                    }
                    // Get token info with error handling
                    let symbol = reserve.symbol;
                    let decimals = 18; // Default to 18 decimals
                    try {
                        const tokenContract = new ethers_1.ethers.Contract(asset, abis_1.abis.erc20, this.provider);
                        // Get symbol and decimals with fallbacks
                        try {
                            symbol = await tokenContract.symbol();
                        }
                        catch (e) {
                            console.warn(`Could not get symbol for token ${asset}:`, e);
                            symbol = reserve.symbol || 'UNKNOWN';
                        }
                        try {
                            decimals = await tokenContract.decimals();
                        }
                        catch (e) {
                            console.warn(`Could not get decimals for token ${asset}, using 18:`, e);
                        }
                        // Get user's aToken balance
                        const aTokenContract = new ethers_1.ethers.Contract(reserveData[7], // aToken address
                        abis_1.abis.erc20, this.provider);
                        const [aTokenBalance, stableDebt, variableDebt] = await Promise.all([
                            aTokenContract.balanceOf(this.walletAddress).catch(() => ethers_1.ethers.BigNumber.from(0)),
                            new ethers_1.ethers.Contract(reserveData[8], // stable debt token
                            abis_1.abis.erc20, this.provider).balanceOf(this.walletAddress).catch(() => ethers_1.ethers.BigNumber.from(0)),
                            new ethers_1.ethers.Contract(reserveData[9], // variable debt token
                            abis_1.abis.erc20, this.provider).balanceOf(this.walletAddress).catch(() => ethers_1.ethers.BigNumber.from(0))
                        ]);
                        // Calculate APYs (rates are in RAY units, 1e27)
                        const liquidityRate = reserveData[2] || ethers_1.ethers.BigNumber.from(0);
                        const currentVariableBorrowRate = reserveData[4] || ethers_1.ethers.BigNumber.from(0);
                        // Format values
                        const supplied = parseFloat(ethers_1.ethers.utils.formatUnits(aTokenBalance, decimals)).toFixed(6);
                        const borrowed = parseFloat(ethers_1.ethers.utils.formatUnits(stableDebt.add(variableDebt), decimals)).toFixed(6);
                        // Convert rates to APY percentages
                        const supplyAPY = (parseFloat(ethers_1.ethers.utils.formatUnits(liquidityRate, 25)) / 100).toFixed(2);
                        const borrowAPY = (parseFloat(ethers_1.ethers.utils.formatUnits(currentVariableBorrowRate, 25)) / 100).toFixed(2);
                        // Only include positions with non-zero balances
                        if (aTokenBalance.gt(0) || stableDebt.gt(0) || variableDebt.gt(0)) {
                            return {
                                asset,
                                symbol,
                                supplied,
                                borrowed,
                                supplyAPY,
                                borrowAPY,
                            };
                        }
                        return null;
                    }
                    catch (error) {
                        console.warn(`Error processing Aave reserve ${symbol} (${asset}):`, error);
                        return null;
                    }
                }
                catch (error) {
                    console.warn(`Error fetching data for reserve ${reserve.symbol || 'unknown'} (${asset}):`, error);
                    return null;
                }
            });
            // Wait for all promises to settle and filter out null results
            const results = await Promise.allSettled(reservePromises);
            // Process results
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    positions.push(result.value);
                }
            }
            // Filter out any null/undefined positions that might have slipped through
            return positions.filter((p) => p !== null && p !== undefined);
        }
        catch (error) {
            console.error('Error in AaveService.getPositions:', error);
            return [];
        }
    }
}
exports.AaveService = AaveService;
//# sourceMappingURL=aaveService.js.map