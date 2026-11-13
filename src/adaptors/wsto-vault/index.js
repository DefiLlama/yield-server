const sdk = require('@defillama/sdk');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const project = 'wsto-vault';

// wstO: non-rebasing share of the O held by the vault. The O per wstO rises when wstO is burned
// (every swap in wstO/launch-token pairs burns part of the wstO side) or when O is sent to the vault.
// Each chain runs its own vault with an independent rate.
const VAULTS = {
  robinhood: {
    vault: '0xE92bD1C05E4E308792003C8205127A6FA662b4D4',
    url: 'https://staking.o1.exchange/?chain=4663',
  },
  base: {
    vault: '0x80C6BAE89B636c6Ee96FE8F198c0D6926C2C91df',
    url: 'https://staking.o1.exchange/?chain=8453',
  },
};

// O has no coins-service price on Robinhood Chain; price it with its CoinGecko id on every chain.
const O_PRICE_KEY = 'coingecko:o1-exchange';
const DAY = 24 * 3600;
const ONE_SHARE = (10n ** 18n).toString();

const rateAt = async (vault, chain, block) => {
  const { output } = await sdk.api.abi.call({
    target: vault,
    abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
    params: [ONE_SHARE],
    chain,
    block,
  });
  return new BigNumber(output).shiftedBy(-18).toNumber();
};

// Simple annualization of the observed rate change. Share burns and O donations can move the
// rate in bursts; this does not assume that a single day's increase is compounded throughout a year.
const annualize = (rateNow, ratePrior, days) =>
  rateNow > 0 && ratePrior > 0
    ? (rateNow / ratePrior - 1) * (365 / days) * 100
    : null;

const getPool = async (chain, { vault, url }, oPrice) => {
  // 60s safety margin so the block endpoint never errors on "timestamp after now"
  const now = Math.floor(Date.now() / 1e3) - 60;
  const [blockNow, block1d, block7d] = await utils.getBlocksByTime(
    [now, now - DAY, now - 7 * DAY],
    chain
  );

  const [asset, totalAssets, rateNow, rate1d, rate7d] = await Promise.all([
    sdk.api.abi.call({ target: vault, abi: 'address:asset', chain }),
    sdk.api.abi.call({
      target: vault,
      abi: 'uint256:totalAssets',
      chain,
      block: blockNow,
    }),
    rateAt(vault, chain, blockNow),
    rateAt(vault, chain, block1d),
    rateAt(vault, chain, block7d),
  ]);

  return {
    pool: `${vault}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project,
    symbol: 'O',
    tvlUsd:
      new BigNumber(totalAssets.output).shiftedBy(-18).toNumber() * oPrice,
    apyBase: annualize(rateNow, rate1d, 1),
    apyBase7d: annualize(rateNow, rate7d, 7),
    pricePerShare: rateNow,
    underlyingTokens: [asset.output],
    token: vault,
    poolMeta: 'wstO',
    url,
  };
};

const apy = async () => {
  // keyed by the part after "coingecko:", so this does not depend on CoinGecko's symbol
  const oPrice = (await utils.getPrices([O_PRICE_KEY])).pricesByAddress[
    'o1-exchange'
  ];
  if (!oPrice) throw new Error(`no price for ${O_PRICE_KEY}`);

  // Chains are independent: an RPC failure on one (e.g. Robinhood nodes without the 24h/7d-old state)
  // must not drop the other chain's pool.
  const chains = Object.keys(VAULTS);
  const results = await Promise.allSettled(
    chains.map((chain) => getPool(chain, VAULTS[chain], oPrice))
  );
  results.forEach((result, i) => {
    if (result.status === 'rejected')
      console.error(
        `${project} ${chains[i]}: ${result.reason?.message ?? result.reason}`
      );
  });
  const pools = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (!pools.length) throw new Error(`${project}: no chain returned a pool`);
  return pools;
};

module.exports = {
  protocolId: '9425',
  timetravel: false,
  apy,
  url: 'https://staking.o1.exchange',
};
