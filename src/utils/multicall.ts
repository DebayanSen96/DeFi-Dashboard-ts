import { Contract, JsonRpcProvider, Interface, InterfaceAbi } from 'ethers';

// Multicall3 contract addresses for different chains
const MULTICALL_ADDRESSES = {
  ethereum: '0xcA11bde05977b3631167028862bE2a173976CA11',
  base: '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Add other chains as needed
} as const;

type ChainId = keyof typeof MULTICALL_ADDRESSES;

interface MulticallCall {
  target: string;
  abi: Interface | InterfaceAbi;
  functionName: string;
  params?: any[];
  allowFailure?: boolean;
}

interface CallResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class Multicall {
  private contract: Contract;
  private chainId: ChainId;
  private provider: JsonRpcProvider;
  
  private static readonly ABI = [
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])'
  ] as const;

  constructor(provider: JsonRpcProvider, chainId: ChainId) {
    this.provider = provider;
    this.chainId = chainId;
    
    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) {
      throw new Error(`Multicall not supported for chain: ${chainId}`);
    }
    
    this.contract = new Contract(multicallAddress, Multicall.ABI, provider);
  }

  async batchCall<T = any>(calls: MulticallCall[]): Promise<CallResult<T>[]> {
    try {
      const callDatas = calls.map(call => {
        const iface = call.abi instanceof Interface ? call.abi : new Interface(call.abi);
        const callData = iface.encodeFunctionData(call.functionName, call.params || []);
        return {
          target: call.target,
          allowFailure: call.allowFailure !== false, // default to true
          callData
        } as const;
      });

      const results: Array<[boolean, string]> = await this.contract.aggregate3.staticCall(callDatas);
      
      return results.map(([success, returnData], i) => {
        if (!success) {
          return { success: false, error: 'Call failed' } as const;
        }
        
        try {
          const call = calls[i];
          const iface = call.abi instanceof Interface ? call.abi : new Interface(call.abi);
          const decoded = iface.decodeFunctionResult(call.functionName, returnData) as T;
          return { success: true, data: decoded } as const;
        } catch (error) {
          return { 
            success: false as const, 
            error: error instanceof Error ? error.message : 'Failed to decode result' 
          } as const;
        }
      });
    } catch (error) {
      console.error('Multicall error:', error);
      // Return mock results with errors instead of throwing
      return calls.map(() => ({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown multicall error'
      }));
    }
  }
}

export async function multicall<T = any>(
  provider: JsonRpcProvider,
  calls: MulticallCall[],
  chainId: ChainId = 'ethereum',
  blockNumber: number | 'latest' = 'latest'
): Promise<Array<T | null>> {
  try {
    const multicall = new Multicall(provider, chainId);
    const results = await multicall.batchCall(calls);
    
    return results.map(result => 
      result.success ? (result.data as T) : null
    );
  } catch (error) {
    console.error('Multicall error:', error);
    return calls.map(() => null);
  }
}
