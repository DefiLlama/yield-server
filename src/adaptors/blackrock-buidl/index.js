const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply, getPriceApiUrl, getSolanaAccount } = require('../utils');

const project = 'blackrock-buidl';

// RedStone push feeds (8 decimals, daily accrual), read on chain. The public
// gateway (oracle-gateway-1) is switched off on 2026-10-29.
// Addresses: redstone-oracles-monorepo relayer-remote-config/main manifests.
const FEED_DECIMALS = 8;
const MAX_FEED_AGE = 3 * 86400; // relayer heartbeat is 24h
const REDSTONE_SOLANA_PROGRAM = 'REDSTBDUecGjwXd6YGPzHSvEUBHQqVRfCcjUVgPiHsr';

const evmPools = [
  { chain: 'ethereum', chainName: 'Ethereum', address: '0x7712c34205737192402172409a8f7ccef8aa2aec', feed: '0x9c303927dC4939692CC60641D6ceABa9185d687a' },
  { chain: 'ethereum', chainName: 'Ethereum', address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041', feed: '0xd6156F8177aA1a6E0c5278CE437A9BDB32F203ef', poolMeta: 'Institutional' },
  { chain: 'polygon', chainName: 'Polygon', address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99', feed: '0x24c8964338Deb5204B096039147B8e8C3AEa42Cc' },
  { chain: 'avax', chainName: 'Avalanche', address: '0x53fc82f14f009009b440a706e31c9021e1196a2f', feed: '0xB89Cc2Ce1CaD0d26Fed6794C1f4cF4b28684624A' },
  { chain: 'optimism', chainName: 'Optimism', address: '0xa1cdab15bba75a80df4089cafba013e376957cf5', feed: '0x24c8964338Deb5204B096039147B8e8C3AEa42Cc' },
  { chain: 'arbitrum', chainName: 'Arbitrum', address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872', feed: '0x3587a73AA02519335A8a6053a97657BECe0bC2Cc' },
  // ponytail: RedStone has no BSC feed; BSC dividend mints sit ~0.27 ppm/day
  // under BUIDL-I's (~0.01% APY), so proxy it. Swap in a BSC feed if one ships.
  { chain: 'bsc', chainName: 'BSC', address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f', feedChain: 'ethereum', feed: '0xd6156F8177aA1a6E0c5278CE437A9BDB32F203ef' },
];

const SOLANA_TOKEN = 'GyWgeqpy5GueU2YbkE8xqUeVEokCMMCEeUrfbtMw6phr';
const SOLANA_FEED = 'CPKJ57Kvxf8Xrz1o3hqBK52SqqEUAPp1NVdCK94bDGSX'; // BUIDL_SOLANA_DAILY_ACCRUAL

const APTOS_NODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_RESOURCE_ACCOUNT =
  '0x50038be55be5b964cfa32cf128b5cf05f123959f286b4cc02b86cafd48945f89';
const APTOS_TOKEN_DATA_TYPE =
  '0x4de5876d8a8e2be7af6af9f3ca94d9e4fafb24b5f4a5848078d8eb08f08e808a::ds_token::TokenData';
const APTOS_DECIMALS = 6;
const APTOS_FEED = { chain: 'ethereum', address: '0x9c303927dC4939692CC60641D6ceABa9185d687a' }; // BUIDL_DAILY_INTEREST_ACCRUAL

const now = () => Date.now() / 1000;

// Returns the daily accrual rate, or null on a failed, zero or stale read.
const readEvmFeed = ({ chain, address }) =>
  sdk.api.abi
    .call({
      target: address,
      chain,
      abi: 'function latestRoundData() view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)',
    })
    .then(({ output }) =>
      now() - Number(output.updatedAt) < MAX_FEED_AGE
        ? Number(output.answer) / 10 ** FEED_DECIMALS
        : null
    )
    .catch(() => null);

// RedStone Solana price account: 8B discriminator, 32B feed id, u256 BE value,
// u64 LE timestamp (ms).
const readSolanaFeed = (address) =>
  getSolanaAccount(address)
    .then((acc) => {
      if (acc?.owner !== REDSTONE_SOLANA_PROGRAM) return null;
      const ts = Number(acc.data.readBigUInt64LE(72)) / 1000;
      if (now() - ts >= MAX_FEED_AGE) return null;
      return Number(BigInt(`0x${acc.data.subarray(40, 72).toString('hex')}`)) / 10 ** FEED_DECIMALS;
    })
    .catch(() => null);

const dailyAccrualToApy = (rate) =>
  rate > 0 ? (Math.pow(1 + rate, 365) - 1) * 100 : null;

const apy = async () => {
  // Fetch EVM supplies, decimals, prices, and Solana supply in parallel
  const priceKeys = evmPools
    .map((p) => `${p.chain}:${p.address}`)
    .concat(`solana:${SOLANA_TOKEN}`)
    .join(',')
    .toLowerCase();

  const [supplyResults, decimalsResults, solSupply, aptosResources, pricesRes, evmRates, solRate, aptosRate] =
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
        .get(getPriceApiUrl(`/prices/current/${priceKeys}`))
        .catch(() => ({ data: { coins: {} } })),
      Promise.all(
        evmPools.map((p) => readEvmFeed({ chain: p.feedChain || p.chain, address: p.feed }))
      ),
      readSolanaFeed(SOLANA_FEED),
      readEvmFeed(APTOS_FEED),
    ]);

  const prices = pricesRes.data.coins;
  const getPrice = (key) => prices[key.toLowerCase()]?.price ?? 1;

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    const { chain, chainName, address, poolMeta } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;
    const apyBase = dailyAccrualToApy(evmRates[i]);

    if (supply < 10000 || apyBase === null) continue;

    const price = getPrice(`${chain}:${address}`);

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'BUIDL',
      tvlUsd: supply * price,
      apyBase,
      underlyingTokens: [address],
      ...(poolMeta && { poolMeta }),
    });
  }

  const solApy = dailyAccrualToApy(solRate);
  if (solSupply > 10000 && solApy !== null) {
    const solPrice = getPrice(`solana:${SOLANA_TOKEN}`);

    pools.push({
      pool: SOLANA_TOKEN,
      chain: 'Solana',
      project,
      symbol: 'BUIDL',
      tvlUsd: solSupply * solPrice,
      apyBase: solApy,
      underlyingTokens: [SOLANA_TOKEN],
    });
  }

  const aptosTokenData = aptosResources.find(
    (r) => r.type === APTOS_TOKEN_DATA_TYPE
  );
  const aptosApy = dailyAccrualToApy(aptosRate);
  if (aptosTokenData && aptosApy !== null) {
    const aptosSupply =
      Number(aptosTokenData.data.total_issued) / 10 ** APTOS_DECIMALS;
    if (aptosSupply > 10000) {
      pools.push({
        pool: `${APTOS_RESOURCE_ACCOUNT}-aptos`,
        chain: 'Aptos',
        project,
        symbol: 'BUIDL',
        tvlUsd: aptosSupply,
        apyBase: aptosApy,
        underlyingTokens: [APTOS_RESOURCE_ACCOUNT],
      });
    }
  }

  return pools;
};

module.exports = {
  protocolId: '4853',
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/blackrock-fund',
};
