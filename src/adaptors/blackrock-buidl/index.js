const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

const project = 'blackrock-buidl';

const REDSTONE_URL =
  'https://oracle-gateway-1.a.redstone.finance/data-packages/latest/redstone-primary-prod';

const evmPools = [
  { chain: 'ethereum', chainName: 'Ethereum', address: '0x7712c34205737192402172409a8f7ccef8aa2aec', feedId: 'BUIDL_DAILY_INTEREST_ACCRUAL' },
  { chain: 'ethereum', chainName: 'Ethereum', address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041', feedId: 'BUIDL_I_ETHEREUM_DAILY_ACCRUAL', poolMeta: 'Institutional' },
  { chain: 'polygon', chainName: 'Polygon', address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99', feedId: 'BUIDL_POLYGON_DAILY_ACCRUAL' },
  { chain: 'avax', chainName: 'Avalanche', address: '0x53fc82f14f009009b440a706e31c9021e1196a2f', feedId: 'BUIDL_AVALANCHE_DAILY_ACCRUAL' },
  { chain: 'optimism', chainName: 'Optimism', address: '0xa1cdab15bba75a80df4089cafba013e376957cf5', feedId: 'BUIDL_OPTIMISM_DAILY_ACCRUAL' },
  { chain: 'arbitrum', chainName: 'Arbitrum', address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872', feedId: 'BUIDL_ARBITRUM_DAILY_ACCRUAL' },
  { chain: 'bsc', chainName: 'BSC', address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f', feedId: 'BUIDL_DAILY_INTEREST_ACCRUAL' },
];

const SOLANA_TOKEN = 'GyWgeqpy5GueU2YbkE8xqUeVEokCMMCEeUrfbtMw6phr';
const SOLANA_FEED = 'BUIDL_SOLANA_DAILY_ACCRUAL';

const APTOS_NODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_RESOURCE_ACCOUNT =
  '0x50038be55be5b964cfa32cf128b5cf05f123959f286b4cc02b86cafd48945f89';
const APTOS_TOKEN_DATA_TYPE =
  '0x4de5876d8a8e2be7af6af9f3ca94d9e4fafb24b5f4a5848078d8eb08f08e808a::ds_token::TokenData';
const APTOS_DECIMALS = 6;
const APTOS_FEED = 'BUIDL_DAILY_INTEREST_ACCRUAL';

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

  // Fetch EVM supplies, decimals, prices, and Solana supply in parallel
  const priceKeys = evmPools
    .map((p) => `${p.chain}:${p.address}`)
    .concat(`solana:${SOLANA_TOKEN}`)
    .join(',')
    .toLowerCase();

  const [supplyResults, decimalsResults, solSupply, aptosResources, pricesRes] =
    await Promise.all([
      Promise.all(
        evmPools.map((p) =>
          sdk.api.erc20
            .totalSupply({ target: p.address, chain: p.chain })
            .catch(() => ({ output: '0' }))
        )
      ),
      Promise.all(
        evmPools.map((p) =>
          sdk.api.abi
            .call({ target: p.address, chain: p.chain, abi: 'erc20:decimals' })
            .catch(() => ({ output: 6 }))
        )
      ),
      getTotalSupply(SOLANA_TOKEN).catch(() => 0),
      axios
        .get(`${APTOS_NODE}/accounts/${APTOS_RESOURCE_ACCOUNT}/resources`)
        .then((r) => r.data)
        .catch(() => []),
      axios
        .get(`https://coins.llama.fi/prices/current/${priceKeys}`)
        .catch(() => ({ data: { coins: {} } })),
    ]);

  const prices = pricesRes.data.coins;
  const getPrice = (key) => prices[key.toLowerCase()]?.price ?? 1;

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    const { chain, chainName, address, feedId, poolMeta } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;

    if (supply < 10000) continue;

    const price = getPrice(`${chain}:${address}`);

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'BUIDL',
      tvlUsd: supply * price,
      apyBase: dailyAccrualToApy(getRedstoneRate(feeds, feedId)),
      underlyingTokens: [address],
      ...(poolMeta && { poolMeta }),
    });
  }

  if (solSupply > 10000) {
    const solPrice = getPrice(`solana:${SOLANA_TOKEN}`);

    pools.push({
      pool: SOLANA_TOKEN,
      chain: 'Solana',
      project,
      symbol: 'BUIDL',
      tvlUsd: solSupply * solPrice,
      apyBase: dailyAccrualToApy(getRedstoneRate(feeds, SOLANA_FEED)),
      underlyingTokens: [SOLANA_TOKEN],
    });
  }

  const aptosTokenData = aptosResources.find(
    (r) => r.type === APTOS_TOKEN_DATA_TYPE
  );
  if (aptosTokenData) {
    const aptosSupply =
      Number(aptosTokenData.data.total_issued) / 10 ** APTOS_DECIMALS;
    if (aptosSupply > 10000) {
      pools.push({
        pool: `${APTOS_RESOURCE_ACCOUNT}-aptos`,
        chain: 'Aptos',
        project,
        symbol: 'BUIDL',
        tvlUsd: aptosSupply,
        apyBase: dailyAccrualToApy(getRedstoneRate(feeds, APTOS_FEED)),
        underlyingTokens: [APTOS_RESOURCE_ACCOUNT],
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/blackrock-fund',
};
