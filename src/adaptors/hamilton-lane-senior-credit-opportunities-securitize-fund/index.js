const sdk = require('@defillama/sdk');
const axios = require('axios');

const project = 'hamilton-lane-senior-credit-opportunities-securitize-fund';

// RedStone Chainlink-compatible oracle on Ethereum (8 decimals)
const ORACLE = '0x7d05cd5159f38694a7d4dbf58957146a63c8ad5a';

const evmPools = [
  {
    chain: 'ethereum',
    chainName: 'Ethereum',
    address: '0xda2ffa104356688e74d9340519b8c17f00d7752e',
  },
  {
    chain: 'polygon',
    chainName: 'Polygon',
    address: '0x4c5ca366e26409845624e29b62c388a06961a792',
  },
  {
    chain: 'optimism',
    chainName: 'Optimism',
    address: '0x720f86f4B5b5d5d0ea3E5718EC43071d4d05134b',
  },
];

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`)
    .then((r) => r.data.height);

const getOraclePrice = (block) =>
  sdk.api.abi
    .call({
      target: ORACLE,
      chain: 'ethereum',
      abi: 'int256:latestAnswer',
      block,
    })
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

  // Fetch supplies and decimals in parallel
  const [supplyResults, decimalsResults] = await Promise.all([
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
  ]);

  const pools = [];

  for (let i = 0; i < evmPools.length; i++) {
    if (!supplyResults[i] || !decimalsResults[i]) continue;

    const { chain, chainName, address } = evmPools[i];
    const decimals = Number(decimalsResults[i].output);
    const supply = Number(supplyResults[i].output) / 10 ** decimals;

    if (!Number.isFinite(decimals) || !Number.isFinite(supply)) continue;

    const tvlUsd = supply * priceNow;
    if (
      !Number.isFinite(priceNow) ||
      !Number.isFinite(tvlUsd) ||
      tvlUsd < 10000
    )
      continue;

    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: chainName,
      project,
      symbol: 'HLSCOPE',
      tvlUsd,
      apyBase,
      underlyingTokens: [address],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/hl-scope',
};
