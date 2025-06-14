import { ethers } from 'ethers';
import { protocols } from '../config/protocols';
import { abis } from '../config/abis';
import { chains } from '../config/chains';

interface LidoPosition {
  asset: string;
  symbol: string;
  staked: string;
  stakedInEth: string;
  isWrapped: boolean;
}

export class LidoService {
  private provider: ethers.providers.JsonRpcProvider;
  private walletAddress: string;
  
  constructor(provider: ethers.providers.JsonRpcProvider, walletAddress: string) {
    this.provider = provider;
    this.walletAddress = walletAddress;
  }

  async getPositions(): Promise<LidoPosition[]> {
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;
    const chainName = Object.keys(chains).find(
      (key) => chains[key as keyof typeof chains].chainId === chainId
    );

    if (!chainName || !protocols.lido[chainName]) {
      throw new Error(`Lido not supported on chain ${chainId}`);
    }

    const config = protocols.lido[chainName];
    const positions: LidoPosition[] = [];

    // Check stETH balance
    const stEthContract = new ethers.Contract(
      config.stETH,
      abis.lidoStEth,
      this.provider
    );

    const stEthSymbol = await stEthContract.symbol();
    const stEthDecimals = await stEthContract.decimals();
    
    const stEthShares = await stEthContract.sharesOf(this.walletAddress);
    const stEthBalance = await stEthContract.getPooledEthByShares(stEthShares);
    
    if (stEthShares.gt(0)) {
      positions.push({
        asset: config.stETH,
        symbol: stEthSymbol,
        staked: ethers.utils.formatUnits(stEthBalance, stEthDecimals),
        stakedInEth: ethers.utils.formatUnits(stEthBalance, stEthDecimals),
        isWrapped: false,
      });
    }

    // Check wstETH balance
    const wstEthContract = new ethers.Contract(
      config.wstETH,
      abis.erc20,
      this.provider
    );

    const wstEthSymbol = await wstEthContract.symbol();
    const wstEthDecimals = await wstEthContract.decimals();
    const wstEthBalance = await wstEthContract.balanceOf(this.walletAddress);

    if (wstEthBalance.gt(0)) {
      // For wstETH, we'll just show the wrapped amount
      // In a real implementation, you might want to convert wstETH to stETH and then to ETH
      positions.push({
        asset: config.wstETH,
        symbol: wstEthSymbol,
        staked: ethers.utils.formatUnits(wstEthBalance, wstEthDecimals),
        stakedInEth: '0', // Would need price oracle to convert to ETH
        isWrapped: true,
      });
    }

    return positions;
  }
}
