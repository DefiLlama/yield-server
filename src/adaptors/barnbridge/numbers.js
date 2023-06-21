const superagent = require('superagent');
const { uniqBy, sumBy } = require('lodash');

const { poolByProvider } = require('./SmartYield.js');
const { underlyingBalance, totalUnRedeemed } = require('./IProvider.js');

const getAssetUsdPrice = async (chain, asset) => {
  const key = `${chain.name}:${asset}`.toLowerCase();
  const assetPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;

  return assetPriceUSD;
};

const getPrices = async (chain, terms) => {
  const assets = [...new Set(terms.map((term) => term.underlying))];

  const assetAndUsdPrices = await Promise.all(
    assets.map(async (asset) => [asset, await getAssetUsdPrice(chain, asset)])
  );

  return Object.fromEntries(assetAndUsdPrices);
};

const userDepositsForTerms = async (chain, terms, valueInUSD) => {
  const prices = await getPrices(chain, terms);

  const userDeposits = sumBy(terms, (term) => {
    const value = valueInUSD
      ? (term.currentDepositedAmount / `1e${term.underlyingDecimals}`) *
        prices[term.underlying]
      : term.currentDepositedAmount / `1e${term.underlyingDecimals}`;

    return value;
  });

  return userDeposits;
};

const liquidityProviderBalanceForTerms = async (
  chain,
  terms,
  valueInUSD = false
) => {
  const prices = await getPrices(chain, terms);

  const providers = uniqBy(terms, 'provider').map((term) => ({
    provider: term.provider,
    decimals: term.underlyingDecimals,
    underlying: term.underlying,
  }));

  const values = await Promise.all(
    providers.map(async ({ provider, decimals, underlying }) => {
      const liquidityProviderBalance = (await poolByProvider(chain, provider))
        .liquidityProviderBalance;

      const value = valueInUSD
        ? (liquidityProviderBalance / `1e${decimals}`) * prices[underlying]
        : liquidityProviderBalance / `1e${decimals}`;

      return { value, decimals, underlying };
    })
  );

  const liquidityProviderBalance = sumBy(
    values,
    ({ value, decimals, underlying }) => value
  );

  return liquidityProviderBalance;
};

const totalValueLockedForTerms = async (chain, terms, valueInUSD) => {
  const liquidityProviderBalance = await liquidityProviderBalanceForTerms(
    chain,
    terms,
    valueInUSD
  );

  const userDeposits = await userDepositsForTerms(chain, terms, valueInUSD);

  return liquidityProviderBalance + userDeposits;
};

const earnedYieldIfNextTermOfActiveTerm = (
  activeTerms,
  termId,
  earnedYield
) => {
  // Return earned yield only when the term we're viewing (termId) is the next term of the currently active term.

  const nextTerm = activeTerms.find(
    (term) =>
      term.nextTerm &&
      termId &&
      term.nextTerm.id.toLowerCase() === termId.toLowerCase()
  );

  return nextTerm && earnedYield ? earnedYield : 0;
};

const earnedYieldByProviderForTerms = async (chain, terms) => {
  const providers = uniqBy(terms, 'provider').map((term) => ({
    provider: term.provider,
    decimals: term.underlyingDecimals,
    underlying: term.underlying,
  }));

  const providerValues = await Promise.all(
    providers.map(async ({ provider, decimals, underlying }) => {
      const _underlyingBalance = await underlyingBalance(chain, provider);
      const _totalUnRedeemed = await totalUnRedeemed(chain, provider);

      const value =
        _underlyingBalance / `1e${decimals}` -
        _totalUnRedeemed / `1e${decimals}`;

      return { provider, value };
    })
  );

  const earnedYieldByProvider = providerValues.reduce(
    (previousValue, currentValue) => ({
      ...previousValue,
      [currentValue.provider]: currentValue.value,
    }),
    {}
  );

  return earnedYieldByProvider;
};

const yieldToBeDistributed = (term, earnedYield) => {
  const realizedYield = +term.realizedYield / `1e${term.underlyingDecimals}`;
  return realizedYield + earnedYield;
};

const apyBase = (term, earnedYield) => {
  const userDeposits = +term.depositedAmount / `1e${term.underlyingDecimals}`;

  const timeDifference = +term.end - +term.start;
  const timeInYear = 60 * 60 * 24 * 365;
  const fee = +term.feeRate / 10000;

  const numberOfPeriods = timeDifference / timeInYear;

  const totalFee = (fee / numberOfPeriods) * 100;

  const totalRealizedYield = yieldToBeDistributed(term, earnedYield);

  const apy =
    +userDeposits === 0
      ? 0
      : (+totalRealizedYield / +userDeposits / timeDifference) *
        timeInYear *
        100;

  return apy - totalFee;
};

module.exports = {
  liquidityProviderBalanceForTerms,
  totalValueLockedForTerms,
  earnedYieldIfNextTermOfActiveTerm,
  earnedYieldByProviderForTerms,
  apyBase,
};
