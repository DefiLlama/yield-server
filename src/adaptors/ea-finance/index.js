const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT_NAME = 'ea-finance';
const DEPOSIT_CONTRACT = '0x23EbC3770f98c01EDAB20eb1eF17Ee633c19b467';
const WCC_ADDRESS = '0x6050D829F5a5E0eA758D8357DDcdeC1381699248';

// Morpheus wCC liquidity pools. Both tokens are Wrapped Canton Coin.
const LP_POOLS = [
  {
    chain: 'robinhood',
    id: '0x36849ecfa7d90c62d6bf99de306abe27229d1518',
    symbol: 'wCC-USDG',
    underlyingTokens: [
      '0xAB47ee9879649E57037E3cE2Ee988DFddF938E61',
      '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    ],
    subgraph:
      'https://api.goldsky.com/api/public/project_cm8pwdzcow9bu01xm6gdhatu4/subgraphs/analytics/v1.0.0/gn',
    url: 'https://app.morpheus.farm/earn/pool/0x36849ecfa7d90c62d6bf99de306abe27229d1518',
  },
  {
    chain: 'bsc',
    id: '0x211d0694cb0e96959707dd7497f15b22ccb5bac9',
    symbol: 'wCC-USD1',
    underlyingTokens: [
      WCC_ADDRESS,
      '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
    ],
    subgraph:
      'https://api.goldsky.com/api/public/project_cmvix0gy4l0xs01wu9tobhqwe/subgraphs/analytics/v1.0.1/gn',
    url: 'https://app.morpheus.farm/earn/pool/0x211d0694cb0e96959707dd7497f15b22ccb5bac9',
  },
];

const LP_QUERY = `
  query WccPool($id: ID!) {
    pool(id: $id) {
      totalValueLockedUSD
    }
    poolDayDatas(
      first: 1
      orderBy: date
      orderDirection: desc
      where: { pool: $id }
    ) {
      feesUSD
    }
  }
`;

const abis = {
  getCurrentAPY: {
    "inputs": [],
    "name": "getCurrentAPY",
    "outputs": [{ "internalType": "uint256", "name": "apy", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  getContractInfo: {
    "inputs": [],
    "name": "getContractInfo",
    "outputs": [
      { internalType: "uint256", name: "rewardPerPeriodAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardPeriodSeconds", type: "uint256" },
      { internalType: "uint256", name: "totalStakedAmount", type: "uint256" },
      { internalType: "uint256", name: "totalClaimedAmount", type: "uint256" },
      { internalType: "uint256", name: "totalFeesAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardStartTimestamp", type: "uint256" },
      { internalType: "uint256", name: "lastRewardUpdateTimestamp", type: "uint256" },
      { internalType: "uint256", name: "currentTime", type: "uint256" },
      { internalType: "uint256", name: "poolCapAmount", type: "uint256" },
      { internalType: "uint256", name: "walletCapAmount", type: "uint256" },
      { internalType: "uint256", name: "depositFee", type: "uint256" },
    ],
    "stateMutability": "view",
    "type": "function"
  },
  decimals: {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
};

async function getWCCPrice() {
  try {
    const response = await axios.get(
      utils.getPriceApiUrl(`/prices/current/bsc:${WCC_ADDRESS.toLowerCase()}`)
    );
    const priceData = response.data;
    if (priceData && priceData.coins && priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`]) {
      const price = priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`].price;
      return price;
    } else {
      return 0;
    }
  } catch (error) {
    return 0;
  }
}

async function getWccLpPools() {
  const pools = await Promise.all(
    LP_POOLS.map(async (lp) => {
      try {
        const { data } = await axios.post(lp.subgraph, {
          query: LP_QUERY,
          variables: { id: lp.id },
        });
        const tvlUsd = Number(data?.data?.pool?.totalValueLockedUSD);
        if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return null;
        const feesUsd = Number(data?.data?.poolDayDatas?.[0]?.feesUSD || 0);
        return {
          pool: lp.id,
          chain: utils.formatChain(lp.chain),
          project: PROJECT_NAME,
          symbol: lp.symbol,
          tvlUsd,
          apyBase: (feesUsd / tvlUsd) * 365 * 100,
          underlyingTokens: lp.underlyingTokens,
          poolMeta: 'wCC liquidity pool',
          url: lp.url,
        };
      } catch (error) {
        return null;
      }
    })
  );
  return pools.filter(Boolean);
}

const apy = async () => {
  const wccDecimalsCall = await sdk.api.abi.call({
    target: WCC_ADDRESS,
    chain: 'bsc',
    abi: abis.decimals,
  });
  const wccDecimals = Number(wccDecimalsCall.output);
  const wccPrice = await getWCCPrice();

  if (!wccPrice) {
    throw new Error('Failed to fetch WCC price');
  }

  const [apyCall, infoCall] = await Promise.all([
    sdk.api.abi.call({
      target: DEPOSIT_CONTRACT,
      chain: 'bsc',
      abi: abis.getCurrentAPY
    }),
    sdk.api.abi.call({
      target: DEPOSIT_CONTRACT,
      chain: 'bsc',
      abi: abis.getContractInfo
    })
  ]);

  const apyBase = Number(apyCall.output) / 1e4;
  const totalStakedAmountRaw = infoCall.output[2];
  const totalStakedAmount = Number(totalStakedAmountRaw) / (10 ** wccDecimals);
  const tvlUsd = totalStakedAmount * wccPrice;

  const pool = {
    pool: `${DEPOSIT_CONTRACT.toLowerCase()}-bsc`,
    chain: utils.formatChain('bsc'),
    project: PROJECT_NAME,
    symbol: 'WCC',
    tvlUsd,
    apyBase: apyBase * 100,
    underlyingTokens: [WCC_ADDRESS],
    poolMeta: 'EA Finance WCC Staking Pool',
    url: 'https://app.ea.finance/vaults',
  };

  const lpPools = await getWccLpPools();
  return [pool, ...lpPools];
};

module.exports = {
  protocolId: '7252',
  timetravel: false,
  apy,
  url: 'https://app.ea.finance/vaults',
};