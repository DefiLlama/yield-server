const sdk = require('@defillama/sdk');
const { getPriceApiData } = require('../utils');

const CHAIN = 'ethereum';
const STAKING = '0xda34688c14ae164E75D902A962e6C45cD9564448';
const ELUSD = '0x65Fb0f9b196d524De0C4F3BAF572F0a79eb21194';
const SELUSD = '0x0c5B226E075431646c8fd0a909B430E10416a1dE';
const SCALE = 10n ** 18n;
const YEAR = 365 * 24 * 60 * 60;
// Payouts are irregular; a 7-day window smooths empty daily windows.
const WINDOW = 7 * 24 * 60 * 60;

const apy = async () => {
  const { number: block, timestamp } = await sdk.api.util.getLatestBlock(CHAIN);
  const previousBlock = await sdk.api.util.lookupBlock(timestamp - WINDOW, {
    chain: CHAIN,
  });
  const priceKey = `${CHAIN}:${ELUSD.toLowerCase()}`;

  const [price, previousPrice, assets, supply, prices] = await Promise.all([
    sdk.api.abi.call({
      target: STAKING,
      abi: 'uint256:sharePrice',
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.call({
      target: STAKING,
      abi: 'uint256:sharePrice',
      chain: CHAIN,
      block: previousBlock.block,
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
    getPriceApiData(`/prices/current/${priceKey}`),
  ]);

  if (BigInt(supply.output) === 0n) return [];
  const elusdPrice = prices.coins[priceKey]?.price;
  if (!Number.isFinite(elusdPrice) || elusdPrice <= 0)
    throw new Error('DefiLlama price unavailable for elUSD');
  const sharePrice = BigInt(price.output);
  const oldSharePrice = BigInt(previousPrice.output);
  const elapsed = timestamp - previousBlock.timestamp;
  if (oldSharePrice <= 0n || elapsed <= 0)
    throw new Error('Invalid sElUSD yield window');
  const periodReturn =
    Number(((sharePrice - oldSharePrice) * SCALE) / oldSharePrice) / 1e18;
  const apyBase = (Math.pow(1 + periodReturn, YEAR / elapsed) - 1) * 100;
  if (!Number.isFinite(apyBase)) throw new Error('Invalid sElUSD APY');

  return [
    {
      pool: `${SELUSD}-${CHAIN}`.toLowerCase(),
      chain: 'Ethereum',
      project: 'elara-finance',
      symbol: 'sElUSD',
      // Accounted staking assets exclude unsolicited transfers.
      tvlUsd: (Number(assets.output) / 1e18) * elusdPrice,
      apyBase,
      pricePerShare: Number(sharePrice) / 1e18,
      underlyingTokens: [ELUSD],
      token: SELUSD,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '8336',
  timetravel: false,
  apy,
  url: 'https://app.elara.fi/dashboard',
};
