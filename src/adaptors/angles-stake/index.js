const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'sonic';
const ANS = '0x0c4e186eae8acaa7f7de1315d5ad174be39ec987';
const VAULT = '0xe5203be1643465b3c0de28fd2154843497ef4269';
const NATIVE_S = '0x0000000000000000000000000000000000000000';
const WINDOW_SECONDS = 7 * 86400;
const YEAR_SECONDS = 365 * 86400;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const priceKey = `${CHAIN}:${NATIVE_S}`;
  const [currentBlock, previousBlock, prices] = await Promise.all([
    utils.getPriceApiData(`/block/${CHAIN}/${now}`),
    utils.getPriceApiData(`/block/${CHAIN}/${now - WINDOW_SECONDS}`),
    utils.getPriceApiData(`/prices/current/${priceKey}`),
  ]);

  const [currentCredits, previousCredits, backing] = await Promise.all([
    sdk.api.abi.call({
      chain: CHAIN,
      target: ANS,
      abi: 'uint256:rebasingCreditsPerTokenHighres',
      block: currentBlock.height,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: ANS,
      abi: 'uint256:rebasingCreditsPerTokenHighres',
      block: previousBlock.height,
    }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: VAULT,
      abi: 'uint256:totalValue',
      block: currentBlock.height,
    }),
  ]);

  const elapsedSeconds = currentBlock.timestamp - previousBlock.timestamp;
  const currentIndex = Number(currentCredits.output);
  const previousIndex = Number(previousCredits.output);
  const price = prices.coins[priceKey]?.price;
  if (
    !(elapsedSeconds > 0) ||
    !(currentIndex > 0) ||
    !(previousIndex > 0) ||
    !(price > 0)
  ) {
    throw new Error('angles-stake: invalid rebase window or S price');
  }

  // A rebasing holder's balance grows with the inverse of credits per token.
  // Use realized, net-of-fee growth over seven days; deposits and withdrawals
  // change supply but do not represent yield. Annualize the actual block interval.
  const apyBase =
    ((previousIndex / currentIndex) ** (YEAR_SECONDS / elapsedSeconds) - 1) *
    100;

  return [
    {
      pool: `${ANS}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'angles-stake',
      symbol: 'anS',
      // totalValue includes delegated, idle and in-transit S, net of outstanding
      // withdrawals whose anS was already burned. wanS wraps this same backing,
      // so emit one canonical pool instead of counting the wrapper again.
      tvlUsd: (Number(backing.output) / 1e18) * price,
      apyBase,
      underlyingTokens: [NATIVE_S],
      token: ANS,
      isIntrinsicSource: true,
      url: 'https://angles.fi/stake',
    },
  ];
};

module.exports = {
  protocolId: '5709',
  timetravel: false,
  apy,
  url: 'https://angles.fi/stake',
};
