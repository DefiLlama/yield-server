export interface PoolGetPoolsResponse {
  poolGetPools: PoolGetPool[];
}

export interface PoolGetPool {
  id: string;
  address: string;
  chain: string;
  symbol: string;
  displayTokens: DisplayToken[];
  rewardVault?: RewardVault;
  dynamicData: PoolDynamicData;
}

export interface DisplayToken {
  address: string;
}

export interface RewardVault {
  dynamicData: VaultDynamicData;
}

export interface VaultDynamicData {
  apr?: string;
}

export interface PoolDynamicData {
  aprItems: AprItem[];
  totalLiquidity: string;
}

export interface AprItem {
  apr: string;
}
