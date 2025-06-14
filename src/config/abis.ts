export const abis = {
  erc20: [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
  ],
  aaveUiPoolDataProvider: [
    'function getUserReservesData(address provider, address user) external view returns (tuple(address asset, uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)[])',
    'function getReservesList(address provider) external view returns (address[] memory)',
  ],
  lidoStEth: [
    'function sharesOf(address _account) external view returns (uint256)',
    'function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
  ],
  yearnVault: [
    'function balanceOf(address account) external view returns (uint256)',
    'function pricePerShare() external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function token() external view returns (address)',
    'function symbol() external view returns (string)',
  ],
  pendleMarket: [
    'function getReserves() external view returns (uint112, uint112, uint32)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
  ],
  vePendle: [
    'function balanceOf(address account) external view returns (uint256)',
    'function locked(address account) external view returns (int128 amount, uint256 end)',
  ],
  compoundComptroller: [
    'function getAllMarkets() external view returns (address[] memory)',
    'function markets(address cToken) external view returns (bool isListed, uint256 collateralFactorMantissa, bool isComped)',
  ],
  cToken: [
    'function balanceOf(address owner) external view returns (uint256)',
    'function borrowBalanceStored(address account) external view returns (uint256)',
    'function exchangeRateStored() external view returns (uint256)',
    'function underlying() external view returns (address)',
    'function symbol() external view returns (string memory)',
    'function decimals() external view returns (uint8)',
  ],
} as const;
