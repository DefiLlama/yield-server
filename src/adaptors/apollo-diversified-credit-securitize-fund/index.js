const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getTotalSupply } = require('../utils');

const project = 'apollo-diversified-credit-securitize-fund';

// RedStone Chainlink-compatible oracle on Ethereum (8 decimals)
const ORACLE = '0xe2072fb13ff92d04e44cc55574816dba3e539e1d';

const evmPools = [
  { chain: 'ethereum', chainName: 'Ethereum', address: '0x17418038ecF73BA4026c4f428547BF099706F27B' },
  { chain: 'avax', chainName: 'Avalanche', address: '0x7C64925002BFA705834B118a923E9911BeE32875' },
  { chain: 'polygon', chainName: 'Polygon', address: '0xFCe60bBc52a5705CeC5B445501FBAf3274Dc43D0' },
  { chain: 'ink', chainName: 'Ink', address: '0x53Ad50D3B6FCaCB8965d3A49cB722917C7DAE1F3' },
  { chain: 'sei', chainName: 'Sei', address: '0xf7fa6725183e603059fc23d95735bf67f72b2d78' },
];

const SOLANA_TOKEN = 'FubtUcvhSCr3VPXEcxouoQjKQ7NWTCzXyECe76B7L3f8';

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`)
    .then((r) => r.data.height);

const getOraclePrice = (block) =>
  sdk.api.abi
    .call({ target: ORACLE, chain: 'ethereum', abi: 'int256:latestAnswer', block })
    .then((r) => Number(r.output) / 1e8);

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);

  const [blockNow, block7d] = await Promise.all([
    getBlock(now),
    getBlock(now - 86400 * 7).catch(() => null),
  ]);

  const [priceNow, price7d] = await Promise.all([
    getOraclePrice(blockNow).catch(() => null),
    block7d ? getOraclePrice(block7d).catch(() => null) : null,
  ]);

  const apyBase =
    price7d && price7d > 0
      ? ((priceNow - price7d) / price7d) * (365 / 7) * 100
      : 0;

  // Fetch EVM supplies, decimals, and Solana supply
  const [supplyResults, decimalsResults, solSupply] = await Promise.all([
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
  ]);

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    if (!supplyResults[i] || !decimalsResults[i]) continue;

    const { chain, chainName, address } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;

    if (!Number.isFinite(decimals) || !Number.isFinite(supply)) continue;

    const tvlUsd = supply * priceNow;
    if (!Number.isFinite(priceNow) || !Number.isFinite(tvlUsd) || tvlUsd < 10000)
      continue;

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'ACRED',
      tvlUsd,
      apyBase,
      underlyingTokens: [address],
    });
  }

  const solTvl = solSupply * priceNow;
  if (Number.isFinite(solTvl) && solTvl > 10000) {
    pools.push({
      pool: SOLANA_TOKEN,
      chain: 'Solana',
      project,
      symbol: 'ACRED',
      tvlUsd: solTvl,
      apyBase,
      underlyingTokens: [SOLANA_TOKEN],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/invest/apollo-acred',
};
