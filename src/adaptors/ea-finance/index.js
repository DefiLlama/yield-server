const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT_NAME = 'ea-finance';
const DEPOSIT_CONTRACT = '0x23EbC3770f98c01EDAB20eb1eF17Ee633c19b467';
const WCC_ADDRESS = '0x6050D829F5a5E0eA758D8357DDcdeC1381699248';
const RH_WCC_ADDRESS = '0xAB47ee9879649E57037E3cE2Ee988DFddF938E61';

// DefiLlama slug vs @defillama/sdk provider key.
const SDK_CHAIN = { robinhood: 'robinhoodchain' };
const sdkChain = (chain) => SDK_CHAIN[chain] || chain;
const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';

// Morpheus wCC liquidity pools. Both tokens are Wrapped Canton Coin.
const LP_POOLS = [
  {
    chain: 'robinhood',
    id: '0x36849ecfa7d90c62d6bf99de306abe27229d1518',
    symbol: 'wCC-USDG',
    underlyingTokens: [
      RH_WCC_ADDRESS,
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
  query WccPool($id: ID!, $date: Int!) {
    pool(id: $id) {
      fee
      token0 { id decimals }
      token1 { id decimals }
    }
    poolDayDatas(
      first: 1
      orderBy: date
      orderDirection: desc
      where: { pool: $id, date: $date }
    ) {
      date
      feesUSD
    }
  }
`;

const abis = {
  getCurrentAPY: {
    inputs: [],
    name: 'getCurrentAPY',
    outputs: [{ internalType: 'uint256', name: 'apy', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getContractInfo: {
    inputs: [],
    name: 'getContractInfo',
    outputs: [
      { internalType: 'uint256', name: 'rewardPerPeriodAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardPeriodSeconds', type: 'uint256' },
      { internalType: 'uint256', name: 'totalStakedAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'totalClaimedAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'totalFeesAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardStartTimestamp', type: 'uint256' },
      { internalType: 'uint256', name: 'lastRewardUpdateTimestamp', type: 'uint256' },
      { internalType: 'uint256', name: 'currentTime', type: 'uint256' },
      { internalType: 'uint256', name: 'poolCapAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'walletCapAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'depositFee', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  decimals: {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
};

async function getWCCPrice() {
  try {
    const response = await axios.get(
      utils.getPriceApiUrl(`/prices/current/bsc:${WCC_ADDRESS.toLowerCase()}`)
    );
    const priceData = response.data;
    if (
      priceData &&
      priceData.coins &&
      priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`]
    ) {
      return priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`].price;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

function previousUtcDay() {
  return (Math.floor(Date.now() / 1000 / 86400) - 1) * 86400;
}

async function getTokenPrices(priceKeys) {
  const response = await axios.get(
    utils.getPriceApiUrl(`/prices/current/${priceKeys.join(',').toLowerCase()}`)
  );
  return response.data?.coins || {};
}

async function ethCall(rpc, to, data) {
  const { data: res } = await axios.post(rpc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
  if (!res?.result || res.result === '0x') return null;
  return res.result;
}

function balanceOfData(holder) {
  return (
    '0x70a08231' +
    holder.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  );
}

async function getPoolTokenBalances(lp, token0, token1) {
  if (lp.chain === 'robinhood') {
    const data = balanceOfData(lp.id);
    const [raw0, raw1] = await Promise.all([
      ethCall(ROBINHOOD_RPC, token0, data),
      ethCall(ROBINHOOD_RPC, token1, data),
    ]);
    if (raw0 == null || raw1 == null) return null;
    return [Number(BigInt(raw0)), Number(BigInt(raw1))];
  }

  const balances = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: [
      { target: token0, params: [lp.id] },
      { target: token1, params: [lp.id] },
    ],
    chain: sdkChain(lp.chain),
    permitFailure: true,
  });
  const bal0 = balances.output?.[0]?.output;
  const bal1 = balances.output?.[1]?.output;
  if (bal0 == null || bal1 == null) return null;
  return [Number(bal0), Number(bal1)];
}

async function getWccLpPools() {
  const previousDay = previousUtcDay();
  const wccPrice = await getWCCPrice();

  const pools = await Promise.all(
    LP_POOLS.map(async (lp) => {
      try {
        const { data } = await axios.post(lp.subgraph, {
          query: LP_QUERY,
          variables: { id: lp.id.toLowerCase(), date: previousDay },
        });
        const pool = data?.data?.pool;
        if (!pool?.token0 || !pool?.token1) return null;

        const day = data?.data?.poolDayDatas?.[0];
        const feesUsd = day ? Number(day.feesUSD || 0) : 0;

        const token0 = pool.token0.id.toLowerCase();
        const token1 = pool.token1.id.toLowerCase();
        const tokenBalances = await getPoolTokenBalances(lp, token0, token1);
        if (!tokenBalances) return null;

        const [bal0, bal1] = tokenBalances;
        if (!Number.isFinite(bal0) || !Number.isFinite(bal1)) return null;

        const amount0 = bal0 / 10 ** Number(pool.token0.decimals);
        const amount1 = bal1 / 10 ** Number(pool.token1.decimals);

        const priceKeys = [`${lp.chain}:${token0}`, `${lp.chain}:${token1}`];
        const coins = await getTokenPrices(priceKeys);
        let price0 = coins[`${lp.chain}:${token0}`]?.price;
        let price1 = coins[`${lp.chain}:${token1}`]?.price;

        // Robinhood wCC is not priced on coins.llama yet; use BSC wCC.
        if (
          lp.chain === 'robinhood' &&
          token0 === RH_WCC_ADDRESS.toLowerCase() &&
          !price0
        ) {
          price0 = wccPrice;
        }
        if (
          lp.chain === 'robinhood' &&
          token1 === RH_WCC_ADDRESS.toLowerCase() &&
          !price1
        ) {
          price1 = wccPrice;
        }

        if (!price0 || !price1) return null;

        const tvlUsd = amount0 * price0 + amount1 * price1;
        if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return null;

        return {
          pool: `${lp.id.toLowerCase()}-${lp.chain}`,
          chain: utils.formatChain(lp.chain),
          project: PROJECT_NAME,
          symbol: lp.symbol,
          tvlUsd,
          apyBase: (feesUsd / tvlUsd) * 365 * 100,
          underlyingTokens: lp.underlyingTokens,
          poolMeta: `${Number(pool.fee) / 1e4}%`,
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
      abi: abis.getCurrentAPY,
    }),
    sdk.api.abi.call({
      target: DEPOSIT_CONTRACT,
      chain: 'bsc',
      abi: abis.getContractInfo,
    }),
  ]);

  const apyBase = Number(apyCall.output) / 1e4;
  const totalStakedAmountRaw = infoCall.output[2];
  const totalStakedAmount = Number(totalStakedAmountRaw) / 10 ** wccDecimals;
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
