const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const SECONDS_PER_YEAR = 31536000;

const ROLES = {
  LENDER: 0,
  TRADER: 1,
};

const CHAIN_IDS = {
  Ethereum: 'ethereum',
  Arbitrum: 'arbitrum_one',
  Polygon: 'polygon_mainnet',
  Base: 'base',
};

const APY_REWARD_BONUS = 7;

const config = [
  {
    chain: 'Base',
    lensAddress: '0x636177fa2629927500f0d7946b46d6275d2b01d2',
    bucketsFactory: [
      '0xcf552c38a0ecb51982af28d4e475bef27ac2dd25',
      '0x8e8792881227e8fee8a9e05a567a44d3fa04a7f0',
    ],
    positionManager: '0x01ed183275956dbd0064b789b778ca0921e695e9',
  },
  {
    chain: 'Polygon',
    lensAddress: '0xfd5BB42E9B647d316c9c0356D368F09505D0F584',
    bucketsFactory: [
      '0x7E6915D307F434E4171cCee90e180f5021c60089',
      '0x9649CfDCfAa9c80907e63dD9Cb161cBA2033F3A0',
    ],
    positionManager: '0x02bcaA4633E466d151b34112608f60A82a4F6035',
    USDCE: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    EPMX: '0xDc6D1bd104E1efa4A1bf0BBCf6E0BD093614E31A',
    EPMXPriceFeed: '0x103A9FF33c709405DF58f8f209C53f6B5c5eA2BE',
    EPMXPriceFeedDecimals: 8,
  },
  {
    chain: 'Arbitrum',
    lensAddress: '0xa057c1464dD31B3Aacf72Ef3470E0dA9548e551f',
    bucketsFactory: [
      '0x4e6f7372bCE4083c779c17B240A94dc2EA57AE67',
      '0xB4d3A9f10D3D687FaF3b05b9aa3054856A1d7be8',
    ],
    positionManager: '0x86890E30cE9E1e13Db5560BbEb435c55567Af1cd',
    USDCE: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    EPMX: '0xA533f744B179F2431f5395978e391107DC76e103',
    EPMXPriceFeed: '0x053FB5b7c555FC0d9Bc49118023d6B6A4019168f',
    EPMXPriceFeedDecimals: 8,
  },
  {
    chain: 'Ethereum',
    lensAddress: '0xa5b9Fc7038d5e3b054249cf89A065b3Bb15D0d28',
    bucketsFactory: [
      '0x7dE8607157124c894Ba9F18dd6138B5E8AAd5890',
      '0x55120da310A0c5fd81Fd3bb8C177F6649bE30ACc',
    ],
    positionManager: '0x99d63fEA4b3Ef6ca77941df3C5740dAd1586f0B8',
    EPMX: '0xA533f744B179F2431f5395978e391107DC76e103',
    EPMXPriceFeed: '0xF146a76F3Aa82D4cEa3eaB44932b7eE75737E11a',
    EPMXPriceFeedDecimals: 8,
  },
];

const getPoolUrl = (address, chain) =>
  `https://app.primex.finance/#/bucket-details/${address}?network=${CHAIN_IDS[chain]}`;

const addressEq = (addressA, addressB) => {
  if (!addressA || !addressB) return false;
  return addressA.toLowerCase() === addressB.toLowerCase();
};

module.exports = {
  DEAD_ADDRESS,
  SECONDS_PER_YEAR,
  ROLES,
  CHAIN_IDS,
  APY_REWARD_BONUS,
  config,
  getPoolUrl,
  addressEq,
};
