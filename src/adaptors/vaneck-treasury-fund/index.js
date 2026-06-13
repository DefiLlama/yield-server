const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

const project = 'vaneck-treasury-fund';

const REDSTONE_URL =
  'https://oracle-gateway-1.a.redstone.finance/data-packages/latest/redstone-primary-prod';

const evmPools = [
  {
    chain: 'ethereum',
    chainName: 'Ethereum',
    address: '0x2255718832bC9fD3bE1CaF75084F4803DA14FF01',
    feedId: 'VBILL_ETHEREUM_DAILY_ACCRUAL',
  },
  {
    chain: 'bsc',
    chainName: 'BSC',
    address: '0x14d72634328C4D03bBA184A48081Df65F1911279',
    feedId: 'VBILL_BNB_DAILY_ACCRUAL',
  },
  {
    chain: 'avax',
    chainName: 'Avalanche',
    address: '0x7F4546eF315Efc65336187Fe3765ea779Ac90183',
    feedId: 'VBILL_AVALANCHE_DAILY_ACCRUAL',
  },
];

const SOLANA_TOKEN = '34mJztT9am2jybSukvjNqRjgJBZqHJsHnivArx1P4xy1';
const SOLANA_FEED = 'VBILL_SOLANA_DAILY_ACCRUAL';

const getRedstoneRate = (feeds, feedId) => {
  try {
    return feeds[feedId][0].dataPoints[0].value;
  } catch {
    return null;
  }
};

const dailyAccrualToApy = (rate) =>
  rate && rate > 0 ? (Math.pow(1 + rate, 365) - 1) * 100 : 0;

const apy = async () => {
  const feeds = await axios
    .get(REDSTONE_URL, { timeout: 10_000 })
    .then((r) => r.data)
    .catch(() => ({}));

  const priceKeys = evmPools
    .map((p) => `${p.chain}:${p.address}`)
    .concat(`solana:${SOLANA_TOKEN}`)
    .join(',')
    .toLowerCase();

  const [supplyResults, decimalsResults, solSupply, pricesRes] =
    await Promise.all([
      Promise.all(
        evmPools.map((p) =>
          sdk.api.erc20
            .totalSupply({ target: p.address, chain: p.chain })
            .catch(() => null)
        )
      ),
      Promise.all(
        evmPools.map((p) =>
          sdk.api.abi
            .call({ target: p.address, chain: p.chain, abi: 'erc20:decimals' })
            .catch(() => null)
        )
      ),
      getTotalSupply(SOLANA_TOKEN).catch(() => 0),
      axios
        .get(`https://coins.llama.fi/prices/current/${priceKeys}`)
        .catch(() => ({ data: { coins: {} } })),
    ]);

  const prices = pricesRes.data.coins;
  const getPrice = (key) => prices[key.toLowerCase()]?.price ?? 1;

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    if (!supplyResults[i] || !decimalsResults[i]) continue;

    const { chain, chainName, address, feedId } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;

    if (!Number.isFinite(decimals) || !Number.isFinite(supply)) continue;
    if (supply < 10000) continue;

    const price = getPrice(`${chain}:${address}`);

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'VBILL',
      tvlUsd: supply * price,
      apyBase: dailyAccrualToApy(getRedstoneRate(feeds, feedId)),
      underlyingTokens: [address],
    });
  }

  if (solSupply > 10000) {
    const solPrice = getPrice(`solana:${SOLANA_TOKEN}`);

    pools.push({
      pool: SOLANA_TOKEN,
      chain: 'Solana',
      project,
      symbol: 'VBILL',
      tvlUsd: solSupply * solPrice,
      apyBase: dailyAccrualToApy(getRedstoneRate(feeds, SOLANA_FEED)),
      underlyingTokens: [SOLANA_TOKEN],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/vaneck-vbill',
};
