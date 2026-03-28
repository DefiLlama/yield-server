const sdk = require('@defillama/sdk');
const axios = require('axios');

const project = 'securitize-tokenized-aaa-clo-fund';

const TOKEN = '0x51C2d74017390CbBd30550179A16A1c28F7210fc';
// RedStone Chainlink-compatible oracle (8 decimals)
const ORACLE = '0xEdC6287D3D41b322AF600317628D7E226DD3add4';

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`)
    .then((r) => r.data.height);

const getOraclePrice = (block) =>
  sdk.api.abi
    .call({
      target: ORACLE,
      chain: 'ethereum',
      abi: 'uint256:latestAnswer',
      block,
    })
    .then((r) => r.output / 1e8);

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);

  const [blockNow, block7d, block30d] = await Promise.all([
    getBlock(now),
    getBlock(now - 86400 * 7).catch(() => null),
    getBlock(now - 86400 * 30).catch(() => null),
  ]);

  const [priceNow, price7d, price30d] = await Promise.all([
    getOraclePrice(blockNow),
    block7d ? getOraclePrice(block7d).catch(() => null) : null,
    block30d ? getOraclePrice(block30d).catch(() => null) : null,
  ]);

  const apyBase =
    price30d && price30d > 0
      ? ((priceNow - price30d) / price30d) * (365 / 30) * 100
      : 0;
  const apyBase7d =
    price7d && price7d > 0
      ? ((priceNow - price7d) / price7d) * (365 / 7) * 100
      : null;

  const [supplyRes, decimalsRes] = await Promise.all([
    sdk.api.erc20
      .totalSupply({ target: TOKEN, chain: 'ethereum' })
      .catch(() => null),
    sdk.api.abi
      .call({ target: TOKEN, chain: 'ethereum', abi: 'erc20:decimals' })
      .catch(() => null),
  ]);

  if (!supplyRes || !decimalsRes) return [];

  const decimals = Number(decimalsRes.output);
  const supply = Number(supplyRes.output) / 10 ** decimals;

  if (!Number.isFinite(decimals) || !Number.isFinite(supply)) return [];

  const tvlUsd = supply * priceNow;
  if (tvlUsd < 10000) return [];

  return [
    {
      pool: `${TOKEN.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project,
      symbol: 'STAC',
      tvlUsd,
      apyBase,
      ...(apyBase7d != null && { apyBase7d }),
      underlyingTokens: [TOKEN],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/Securitize-BNY-CLO-Fund',
};
