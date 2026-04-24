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
      abi: 'int256:latestAnswer',
      block,
    })
    .then((r) => Number(r.output) / 1e8);

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);

  const [blockNow, block30d] = await Promise.all([
    getBlock(now),
    getBlock(now - 86400 * 30).catch(() => null),
  ]);

  const [priceNow, price30d] = await Promise.all([
    getOraclePrice(blockNow).catch(() => null),
    block30d ? getOraclePrice(block30d).catch(() => null) : null,
  ]);

  const apyBase =
    price30d && price30d > 0
      ? ((priceNow - price30d) / price30d) * (365 / 30) * 100
      : 0;

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
  if (!Number.isFinite(priceNow) || !Number.isFinite(tvlUsd)) return [];

  return [
    {
      pool: `${TOKEN.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project,
      symbol: 'STAC',
      tvlUsd,
      apyBase,
      underlyingTokens: [TOKEN],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://securitize.io/primary-market/Securitize-BNY-CLO-Fund',
};
