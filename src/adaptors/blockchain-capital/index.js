const sdk = require('@defillama/sdk');
const axios = require('axios');

const project = 'blockchain-capital';

const TOKEN = '0x57fD71a86522Dc06D6255537521886057c1772A3';
// RedStone Chainlink-compatible oracle on zkSync Era (8 decimals)
const ORACLE = '0x0eF2418216476Ab5264821070B8c24b6B458F796';

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/era/${timestamp}`)
    .then((r) => r.data.height);

const getOraclePrice = (block) =>
  sdk.api.abi
    .call({
      target: ORACLE,
      chain: 'era',
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

  const [supplyRes, decimalsRes] = await Promise.all([
    sdk.api.erc20
      .totalSupply({ target: TOKEN, chain: 'era' })
      .catch(() => null),
    sdk.api.abi
      .call({ target: TOKEN, chain: 'era', abi: 'erc20:decimals' })
      .catch(() => null),
  ]);

  if (!supplyRes || !decimalsRes) return [];

  const decimals = Number(decimalsRes.output);
  const supply = Number(supplyRes.output) / 10 ** decimals;

  if (!Number.isFinite(decimals) || !Number.isFinite(supply)) return [];

  const tvlUsd = supply * priceNow;
  if (!Number.isFinite(priceNow) || !Number.isFinite(tvlUsd)) return [];

  return [
    {
      pool: `${TOKEN.toLowerCase()}-era`,
      chain: 'zkSync Era',
      project,
      symbol: 'BCAP',
      tvlUsd,
      apyBase,
      underlyingTokens: [TOKEN],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bcap.invest.securitize.io/',
};
