const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const SECONDS_PER_YEAR = 31536000;

const ROLES = {
  LENDER: 0,
  TRADER: 1
}

const CHAIN_IDS = {
  Polygon: 'polygon_mainnet',
  Arbitrum: 'arbitrum_one'
};

const APY_REWARD_BONUS = 7;

const config = [
  {
    chain: 'Polygon',
    lensAddress: '0xCbaEc4b0683Ed6F2C2C318500962857768Fc1366',
    bucketsFactory: '0x7E6915D307F434E4171cCee90e180f5021c60089',
    positionManager: '0x02bcaA4633E466d151b34112608f60A82a4F6035',
    activityRewardDistributor: '0x156e2fC8e1906507412BEeEB6640Bf999a1Ea76b',
    USDCE: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    EPMX: "0xDc6D1bd104E1efa4A1bf0BBCf6E0BD093614E31A",
    EPMXPriceFeed: "0x103A9FF33c709405DF58f8f209C53f6B5c5eA2BE",
    EPMXPriceFeedDecimals: 8,
    apyRewardBySymbol: {
      ['WETH']: 18,
      ['WBTC']: 1,
      ['USDC.E']: 31,
      ['USDT']: 20,
      ['WMATIC']: 21,
    }
  },
  {
    chain: 'Arbitrum',
    lensAddress: '0x3a5CAdB5eDF17876fD2518AEC3a4d804964aA89e',
    bucketsFactory: '0x4e6f7372bCE4083c779c17B240A94dc2EA57AE67',
    positionManager: '0x86890E30cE9E1e13Db5560BbEb435c55567Af1cd',
    activityRewardDistributor: '0x38D94212AAe3f4aB3E4fE801d9021ab0aA371DaB',
    USDCE: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    EPMX: "0xA533f744B179F2431f5395978e391107DC76e103",
    EPMXPriceFeed: "0x053FB5b7c555FC0d9Bc49118023d6B6A4019168f",
    EPMXPriceFeedDecimals: 8,
    apyRewardBySymbol: {
      ['WETH']: 23.5,
      ['WBTC']: 1.25,
      ['USDC']: 39.5,
      ['USDT']: 41,
      ['ARB']: 1,
      ['USDC.E']: 39.5,
    }
  },
  {
    chain: 'Ethereum',
    lensAddress: '0xBF7259d41af428642140C88a10db6921a383FCC1',
    bucketsFactory: '0x7dE8607157124c894Ba9F18dd6138B5E8AAd5890',
    positionManager: '0x99d63fEA4b3Ef6ca77941df3C5740dAd1586f0B8',
    activityRewardDistributor: '0xA622b8DfC3B5Ec283CEefd37768F5B3b3E316730',
    EPMX: "0xA533f744B179F2431f5395978e391107DC76e103",
    EPMXPriceFeed: "0xF146a76F3Aa82D4cEa3eaB44932b7eE75737E11a",
    EPMXPriceFeedDecimals: 8,
    apyRewardBySymbol: {
      ['WETH']: 24,
      ['WBTC']: 2.4,
      ['USDC']: 44.4,
      ['USDT']: 43.2,
      ['MATIC']: 21.6,
      ['DAI']: 39.6,
    }
  },
]

const getPoolUrl = (address, chain) => `https://app.primex.finance/#/bucket-details/${address}?network=${CHAIN_IDS[chain]}`;

const addressEq = (addressA, addressB) => {
  if (!addressA || !addressB) return false;
  return addressA.toLowerCase() === addressB.toLowerCase();
}

module.exports = { DEAD_ADDRESS, SECONDS_PER_YEAR, ROLES, CHAIN_IDS, APY_REWARD_BONUS, config, getPoolUrl, addressEq }