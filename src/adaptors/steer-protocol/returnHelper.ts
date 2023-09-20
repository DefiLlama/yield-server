import axios from 'axios';
import { BigNumber, ethers } from 'ethers';

const PRECISION = BigNumber.from('10').pow(BigNumber.from('36'));
const X192 = BigNumber.from('2').pow(BigNumber.from('192'))
export const DAY_IN_SECONDS = 24 * 60 * 60;
export const YEAR_IN_SECONDS = DAY_IN_SECONDS * 365;
export const WEEK_IN_SECONDS = DAY_IN_SECONDS * 7;
export const MONTH_IN_SECONDS = DAY_IN_SECONDS * 30 
const EpochTime = 1688593733

export enum Chain {
    Mainnet = 'Mainnet',
    Polygon = 'Polygon',
    Arbitrum = 'Arbitrum',
    Optimism = 'Optimism',
    BSC = 'BSC',
    Evmos = 'Evmos',
    Metis = "Metis",
    Avalanche = 'Avalanche',
    PolygonZkEVM = 'PolygonZkEVM',
    ThunderCore = 'ThunderCore'
  }

export enum Period {
    Day = DAY_IN_SECONDS,
    Week = WEEK_IN_SECONDS,
    Month = MONTH_IN_SECONDS,
    Year = YEAR_IN_SECONDS,
    Lifetime = EpochTime
}

  export const networkData = [
    {chainId: 1, wrappedNativeToken: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', name: Chain.Mainnet},
    {chainId: 3, wrappedNativeToken: 'WETH', address: '0xc778417E063141139Fce010982780140Aa0cD5Ab'},
    {chainId: 4, wrappedNativeToken: 'WETH', address: '0xc778417E063141139Fce010982780140Aa0cD5Ab'},
    {chainId: 5, wrappedNativeToken: 'WETH', address: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'},
    {chainId: 42, wrappedNativeToken: 'WETH', address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C'},
    {chainId: 10, wrappedNativeToken: 'WETH', address: '0x4200000000000000000000000000000000000006', name: Chain.Optimism},
    {chainId: 69, wrappedNativeToken: 'WETH', address: '0x4200000000000000000000000000000000000006'},
    {chainId: 42_161, wrappedNativeToken: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', name: Chain.Arbitrum},
    {chainId: 421_611, wrappedNativeToken: 'WETH', address: '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681'},
    {chainId: 137, wrappedNativeToken: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', name: Chain.Polygon},
    {chainId: 56, wrappedNativeToken: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', name: Chain.BSC},
    {chainId: 80_001, wrappedNativeToken: 'WMATIC', address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'},
    {chainId: 9001, wrappedNativeToken: 'WEVMOS', address: '0xD4949664cD82660AaE99bEdc034a0deA8A0bd517', name: Chain.Evmos},
    {chainId: 1088, wrappedNativeToken: 'METIS', address: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000', name: Chain.Metis},
    {chainId: 43_114, wrappedNativeToken: 'WAVAX', address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', name: Chain.Avalanche},
    {chainId: 1101, wrappedNativeToken: 'WMATIC', address: '0xa2036f0538221a77A3937F1379699f44945018d0', name: Chain.PolygonZkEVM},
    {chainId: 108, wrappedNativeToken: 'WTT', address: '0x413cEFeA29F2d07B8F2acFA69d92466B9535f717', name: Chain.ThunderCore},
  ]

export function getGraphUrl(network: number): string | null {
    if (network === 5) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/subgraph";
    } else if (network === 80001) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/mumbai";
    } else if (network === 137) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-polygon";
    } else if (network === 10) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism";
    } else if (network === 42161) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-arbitrum";
    } else if (network === 421613) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol---arb-goerli";
    } else if (network === 420) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism-goerli";
    } else if (network === 56) {
      return "https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-bsc";
    } else if (network === 9001) {
      return "https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-evmos/api";
    } else if (network === 1088) {
      return "https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-metis/api";
    } else if (network === 43114) {
      return "https://api.thegraph.com/subgraphs/name/rakeshbhatt10/avalance-test-subgraph";
    } else if (network === 108) {
      return "https://subgraph.steer.finance/thundercore/subgraphs/name/steerprotocol/steer-thundercore"
    } else if (network === 1101) {
      return "https://subgraph.steer.finance/zkevm/subgraphs/name/steerprotocol/steer-zkevm"
    } else if (network === 42220) {
      return "https://api.thegraph.com/subgraphs/name/rakeshbhatt10/steer-test-celo";
    }
  
    return null
  }


  export async function getSnapshotsFromSubgraph(
    vaultAddress: string,
    subgraphURL: string
  ): Promise<any> {
    const query = `{
        vaultSnapshots(first: 1000, orderBy:timestamp, orderDirection:desc, where: {vaultAddress: "${vaultAddress}"}) {
            id
         totalSupply
         totalAmount0
         vaultAddress {
           id
         }
         totalAmount1
         fees1
         fees0
         sqrtPriceX96
         timestamp
        }
       }`;
  
    const data = JSON.stringify({
      variables: {
        vaultAddress,
      },
      query: query,
    });
  
    const config = {
      method: 'post',
      url: subgraphURL,
      headers: {
        'content-type': 'application/json',
      },
      data: data,
    };
  
    const jobsData = await axios
      .request(config)
      .then((response) => response.data);

    let snapshots = jobsData.data.vaultSnapshots

    // filter out empty snapshots
    snapshots = snapshots.filter((snapshot) => snapshot.totalSupply !== '0')
    //sort them asc
    snapshots.sort((a, b) => a.timestamp - b.timestamp);
    return snapshots
}


export type SnapshotLike = {
    id: string,
    totalSupply: string,
    totalAmount0: string,
    vaultAddress: {
    id: string,
    },
    totalAmount1: string,
    fees1: string,
    fees0: string,
    sqrtPriceX96: string,
    timestamp: string,
};

    export type performanceInterval = {

        startingHoldingsInToken1: number,       // the holdings we started with
        netFeesMeasuredInToken1: number,        // how much was made over the period
        durationInSeconds: number,              // how long our period was
        averageFeePerHolding: number,           // fees / holdings
        averageFeePHPerSecond: number        // (fees / holdings) / durationInSeconds
        // Then we can average out these objects.averageFeePHPerSecond and then multiply by seconds in year
    }

// return only the past number of snapshots from the period
  export function filterSnapshotData(data: SnapshotLike[], timePeriod: Period): SnapshotLike[] {
    // Get the current timestamp in seconds
    const now = Math.floor(Date.now() / 1000);

    // filter by week, if only one or no snapshots, pull last 1 or 2 snapshots
    // If the data length is 7 days or less, return all data
    if (data.length === 2) {
      return data;
    }
    else if (data.length < 2) {
      return []
    }
    // Filter out data that is older than 7 days
    let filteredSnapshots = data.filter(entry => now - parseInt(entry.timestamp) <= timePeriod);
    // if there is less than 2 snapshots filtered, and there are more in the unfiltered, pull those down
  if (filteredSnapshots.length <= 1) {
    filteredSnapshots = data.slice(-2)
  }
  return filteredSnapshots
  }

  // Get value of asset pair with current price
export function getTotalValueInToken1(_token0Amount: string, _token1Amount: string, _sqrtPriceX96: string): number {
    const token0Amount = BigNumber.from(_token0Amount)
    const token1Amount = BigNumber.from(_token1Amount)
    const sqrtPriceX96 = BigNumber.from(Number(_sqrtPriceX96).toLocaleString('fullwide', {useGrouping:false}))

    const sqrtPrice = sqrtPriceX96.pow(2);
    const price = sqrtPrice.mul(PRECISION).div(X192);
    const ratio = parseFloat(price.toString()) / 10**36;

    // calculate amount1 in terms of amount0
    const amount1 = ratio * parseInt(token0Amount.toString());

    // calculate the total value of the pool
    return amount1 + parseInt((token1Amount.toString()));
}

// Analyzis array of snapshots to give the average fee return per second
export function getAverageReturnPerSecondFromSnapshots(snapshots: SnapshotLike[]) {
    const performanceIntervals: performanceInterval[] = []
    const numSnapshots = snapshots.length
    // now we have our snapshots, we can calculate the return per second
    for (let i = 1; i < numSnapshots; i++) {

        // calculate holdings and fees
        // calculates starting holdings at current prices
        const startingHoldings = getTotalValueInToken1(snapshots[i-1].totalAmount0,snapshots[i-1].totalAmount1,snapshots[i].sqrtPriceX96)
        // change in fees with current prices
        const netFees = getTotalValueInToken1(
        (Number(snapshots[i].fees0) - Number(snapshots[i-1].fees0)).toLocaleString('fullwide', {useGrouping:false}),
        (Number(snapshots[i].fees1) - Number(snapshots[i-1].fees1)).toLocaleString('fullwide', {useGrouping:false}),
        snapshots[i].sqrtPriceX96);
        const duration = Number(snapshots[i].timestamp) - Number(snapshots[i-1].timestamp)

      // create arrays of performance intervals
        const interval: performanceInterval = {
            startingHoldingsInToken1: startingHoldings,
            netFeesMeasuredInToken1: netFees,
            durationInSeconds: duration,
            averageFeePerHolding: netFees / startingHoldings,
            averageFeePHPerSecond: (netFees / startingHoldings) / duration
        }
        
        // If the price spikes we get infinite values and NaNs
        if (!isNaN(interval.averageFeePHPerSecond) && isFinite(interval.averageFeePHPerSecond) ) performanceIntervals.push(interval)
    }

    const averageFeePHPSSum = performanceIntervals.map( interval => {
        return interval.averageFeePHPerSecond
    }).reduce((
        total, current
    ) => total + current, 0)
    const averageFeePerHoldingPerSecond = averageFeePHPSSum / (performanceIntervals.length)
    return averageFeePerHoldingPerSecond
}