const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply, getPriceApiUrl, getSolanaAccount } = require('../utils');

const project = 'vaneck-treasury-fund';

// RedStone push feeds (8 decimals, daily accrual), read on chain. The public
// gateway (oracle-gateway-1) is switched off on 2026-10-29.
// Addresses: redstone-oracles-monorepo relayer-remote-config/main manifests.
const FEED_DECIMALS = 8;
const MAX_FEED_AGE = 3 * 86400; // relayer heartbeat is 24h
const REDSTONE_SOLANA_PROGRAM = 'REDSTBDUecGjwXd6YGPzHSvEUBHQqVRfCcjUVgPiHsr';

const evmPools = [
  {
    chain: 'ethereum',
    chainName: 'Ethereum',
    address: '0x2255718832bC9fD3bE1CaF75084F4803DA14FF01',
    feed: '0x5cC480aeCAd8F52ebd25b9B427737e401E47e8B0', // VBILL_ETHEREUM_DAILY_ACCRUAL
  },
  {
    chain: 'bsc',
    chainName: 'BSC',
    address: '0x14d72634328C4D03bBA184A48081Df65F1911279',
    feed: '0x56b13Aa2f3b9fD2a136Ab46fc570E3c549191d71', // VBILL_BNB_DAILY_ACCRUAL
  },
  {
    chain: 'avax',
    chainName: 'Avalanche',
    address: '0x7F4546eF315Efc65336187Fe3765ea779Ac90183',
    feed: '0x4f67Fd74cff274Ef2942223c0f3166b856410AdD', // VBILL_AVALANCHE_DAILY_ACCRUAL
  },
];

const SOLANA_TOKEN = '34mJztT9am2jybSukvjNqRjgJBZqHJsHnivArx1P4xy1';
const SOLANA_FEED = '8aMjLzsmjSEGmgybHWELTEinTw4kn3okfos5zHrt2TJG'; // VBILL_SOLANA_DAILY_ACCRUAL

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
  const priceKeys = evmPools
    .map((p) => `${p.chain}:${p.address}`)
    .concat(`solana:${SOLANA_TOKEN}`)
    .join(',')
    .toLowerCase();

  const [supplyResults, decimalsResults, solSupply, pricesRes, evmRates, solRate] =
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
        .get(getPriceApiUrl(`/prices/current/${priceKeys}`))
        .catch(() => ({ data: { coins: {} } })),
      Promise.all(
        evmPools.map((p) => readEvmFeed({ chain: p.chain, address: p.feed }))
      ),
      readSolanaFeed(SOLANA_FEED),
    ]);

  const prices = pricesRes.data.coins;
  const getPrice = (key) => prices[key.toLowerCase()]?.price ?? 1;

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    if (!supplyResults[i] || !decimalsResults[i]) continue;

    const { chain, chainName, address } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;
    const apyBase = dailyAccrualToApy(evmRates[i]);

    if (!Number.isFinite(decimals) || !Number.isFinite(supply)) continue;
    if (supply < 10000 || apyBase === null) continue;

    const price = getPrice(`${chain}:${address}`);

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'VBILL',
      tvlUsd: supply * price,
      apyBase,
      underlyingTokens: [address],
    });
  }

  const solApy = dailyAccrualToApy(solRate);
  if (solSupply > 10000 && solApy !== null) {
    const solPrice = getPrice(`solana:${SOLANA_TOKEN}`);

    pools.push({
      pool: SOLANA_TOKEN,
      chain: 'Solana',
      project,
      symbol: 'VBILL',
      tvlUsd: solSupply * solPrice,
      apyBase: solApy,
      underlyingTokens: [SOLANA_TOKEN],
    });
  }

  return pools;
};

module.exports = {
  protocolId: '6639',
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/vaneck-vbill',
};
