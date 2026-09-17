const sdk = require('@defillama/sdk');

const CHAIN = 'ethereum';
const STAKING = '0xda34688c14ae164E75D902A962e6C45cD9564448';
const ELUSD = '0x65Fb0f9b196d524De0C4F3BAF572F0a79eb21194';
const SELUSD = '0x0c5B226E075431646c8fd0a909B430E10416a1dE';
const SCALE = 10n ** 18n;
const YEAR = 365 * 24 * 60 * 60;
// Match the dashboard's fixed yield baseline: 1 elUSD per sElUSD.
const BASELINE_TIMESTAMP = Date.parse('2026-07-10T00:26:59Z') / 1000;

const apy = async () => {
  const { number: block, timestamp } = await sdk.api.util.getLatestBlock(CHAIN);
  if (timestamp <= BASELINE_TIMESTAMP) return [];

  const [price, assets, supply] = await Promise.all([
    sdk.api.abi.call({
      target: STAKING,
      abi: 'uint256:sharePrice',
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.call({
      target: STAKING,
      abi: 'uint256:totalElUSD',
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.call({
      target: SELUSD,
      abi: 'erc20:totalSupply',
      chain: CHAIN,
      block,
    }),
  ]);

  if (BigInt(supply.output) === 0n) return [];
  const sharePrice = BigInt(price.output);
  const periodReturn = Number(sharePrice - SCALE) / 1e18;
  const apyBase =
    (Math.pow(1 + periodReturn, YEAR / (timestamp - BASELINE_TIMESTAMP)) - 1) *
    100;
  if (!Number.isFinite(apyBase)) throw new Error('Invalid sElUSD APY');

  return [
    {
      pool: `${SELUSD}-${CHAIN}`.toLowerCase(),
      chain: 'Ethereum',
      project: 'elara-finance',
      symbol: 'sElUSD',
      // Accounted staking assets exclude unsolicited transfers. elUSD is valued
      // at its $1 peg, consistent with the protocol's USD accounting.
      tvlUsd: Number(assets.output) / 1e18,
      apyBase,
      pricePerShare: Number(sharePrice) / 1e18,
      underlyingTokens: [ELUSD],
      token: SELUSD,
      isIntrinsicSource: true,
      poolMeta: 'Staked elUSD (yield since July 10, 2026)',
    },
  ];
};

module.exports = {
  protocolId: '8336',
  timetravel: false,
  apy,
  url: 'https://app.elara.fi/dashboard',
};
