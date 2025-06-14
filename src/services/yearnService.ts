import { ethers, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { protocols } from '../config/protocols';
import { abis } from '../config/abis';
import { chains } from '../config/chains';

type VaultsConfig = {
  [key: string]: string;
};

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

export class YearnService {
  private provider: JsonRpcProvider;
  private walletAddress: string;
  
  constructor(provider: JsonRpcProvider, walletAddress: string) {
    this.provider = provider;
    this.walletAddress = walletAddress;
  }

  async getPositions(): Promise<YearnVaultPosition[]> {
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId); // Convert to number for comparison
    const chainName = Object.keys(chains).find(
      (key) => chains[key as keyof typeof chains].chainId === chainId
    ) as keyof typeof chains;

    if (!chainName || !protocols.yearn[chainName]) {
      throw new Error(`Yearn not supported on chain ${chainId}`);
    }

    const config = protocols.yearn[chainName] as { vaults: VaultsConfig };
    const positions: YearnVaultPosition[] = [];

    // Process each vault in the config
    for (const [vaultName, vaultAddress] of Object.entries(config.vaults)) {
      const vaultAddr = vaultAddress as string;
      try {
        const vaultContract = new ethers.Contract(
          vaultAddr,
          abis.yearnVault,
          this.provider
        );

        const [
          balance,
          pricePerShare,
          decimals,
          tokenAddress,
          symbol
        ] = await Promise.all([
          vaultContract.balanceOf(this.walletAddress),
          vaultContract.pricePerShare(),
          vaultContract.decimals(),
          vaultContract.token(),
          vaultContract.symbol()
        ]);

        if (balance > 0n) {
          const underlyingBalance = (BigInt(balance) * BigInt(pricePerShare)) / (10n ** BigInt(decimals));
          
          // Get the underlying token info
          const tokenContract = new ethers.Contract(
            tokenAddress,
            abis.erc20,
            this.provider
          );
          
          let tokenSymbol: string;
          try {
            tokenSymbol = await tokenContract.symbol();
          } catch (e) {
            console.warn(`Could not get symbol for token ${tokenAddress}:`, e);
            tokenSymbol = 'UNKNOWN';
          }

          positions.push({
            vaultAddress: vaultAddr,
            vaultSymbol: symbol as string,
            tokenAddress: tokenAddress as string,
            tokenSymbol,
            balance: formatUnits(balance, decimals),
            pricePerShare: formatUnits(pricePerShare, decimals),
            underlyingBalance: formatUnits(underlyingBalance, decimals),
          });
        }
      } catch (error) {
        console.error(`Error fetching data for vault ${vaultName} (${vaultAddress}):`, error);
      }
    }

    return positions;
  }
}
