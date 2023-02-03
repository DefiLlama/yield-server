const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const ERC20 = require('./abis/ERC20.js');
const IProvider = require('./abis/IProvider.js');

const CHAINS = [
  {
    id: 1,
    name: 'ethereum',
    url: 'https://api.thegraph.com/subgraphs/name/barnbridge/bb-sy-mainnet',
    address: '0x8A897a3b2dd6756fF7c17E5cc560367a127CA11F',
    abi: require('./abis/SmartYieldaV2.js'),
  },
  {
    id: 42161,
    name: 'arbitrum',
    url: 'https://api.thegraph.com/subgraphs/name/barnbridge/bb-sy-arbitrum',
    address: '0x1ADDAbB3fAc49fC458f2D7cC24f53e53b290d09e',
    abi: require('./abis/SmartYieldaV3.js'),
  },
];

const termsQuery = () => {
  const now = Math.floor(Date.now() / 1000);

  return gql`
    {
      terms(where: { end_gt: ${now} }) {
        id
        assetName
        assetSymbol
        assetDecimals
        underlying
        underlyingName
        underlyingSymbol
        underlyingDecimals
        active
        start
        end
        feeRate
        realizedYield
        depositedAmount
        nextTerm {
          id
        }
      }
    }
  `;
};

const getAssetUsdPrice = async (chain, asset) => {
  const key = `${chain.name}:${asset}`;
  const assetPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  return assetPriceUSD;
};

const underlying = async () =>
  (
    await sdk.api.abi.call({
      abi: chain.abi.find((i) => i.name === 'underlying'),
      chain: chain.name,
      target: chain.address,
    })
  ).output;

const decimals = async (chain, target) =>
  (
    await sdk.api.abi.call({
      abi: ERC20.find((i) => i.name === 'decimals'),
      chain: chain.name,
      target: target,
    })
  ).output;

const bondProvider = async (chain) =>
  (
    await sdk.api.abi.call({
      abi: chain.abi.find((i) => i.name === 'bondProvider'),
      chain: chain.name,
      target: chain.address,
    })
  ).output;

const underlyingBalance = async (chain, target) =>
  (
    await sdk.api.abi.call({
      abi: IProvider.find((i) => i.name === 'underlyingBalance'),
      chain: chain.name,
      target: target,
    })
  ).output;

const totalUnRedeemed = async (chain, target) =>
  (
    await sdk.api.abi.call({
      abi: IProvider.find((i) => i.name === 'totalUnRedeemed'),
      chain: chain.name,
      target: target,
    })
  ).output;

const liquidityProviderBalance = async (chain) => {
  const balance = (
    await sdk.api.abi.call({
      abi: chain.abi.find((i) => i.name === 'liquidityProviderBalance'),
      chain: chain.name,
      target: chain.address,
    })
  ).output;

  return balance;
};

const earnedYield = async (chain, terms, termId) => {
  const nextTerm = terms.find(
    (t) => t.nextTerm && t.nextTerm.id.toLowerCase() === termId.toLowerCase()
  );

  if (nextTerm) {
    const underlying = underlying(chain);
    const decimals = decimals(chain, underlying);
    const bondProvider = bondProvider(chain);
    const underlyingBalance = underlyingBalance(chain, bondProvider);
    const totalUnRedeemed = totalUnRedeemed(chain, bondProvider);

    const _earnedYield =
      (Number(underlyingBalance) - Number(totalUnRedeemed)) / `1e${decimals}`;

    return _earnedYield;
  }

  return 0;
};

const apyBase = (term, earnedYield) => {
  const userDeposits = Number(term.depositedAmount) / `1e${term.assetDecimals}`;

  const timeDifference = +term.end - +term.start;
  const timeInYear = 60 * 60 * 24 * 365;
  const fee = Number(term.feeRate) / 10000;

  const numberOfPeriods = timeDifference / timeInYear;

  const totalFee = (fee / numberOfPeriods) * 100;

  const totalRealizedYield = yieldToBeDistributed(term, earnedYield);
  const apy =
    Number(userDeposits) === 0
      ? 0
      : (Number(totalRealizedYield) / Number(userDeposits) / timeDifference) *
        timeInYear *
        100;

  return apy - totalFee;
};

const yieldToBeDistributed = (term, earnedYield) => {
  const realizedYield = Number(term.realizedYield) / `1e${term.assetDecimals}`;

  return realizedYield + earnedYield;
};

const apy = async () => {
  const pools = await Promise.all(
    CHAINS.map(async (chain) => {
      const { terms } = await request(chain.url, termsQuery());

      const assets = [...new Set(terms.map((term) => term.underlying))];

      const assetAndUsdPrices = await Promise.all(
        assets.map(async (asset) => [
          asset,
          await getAssetUsdPrice(chain, asset),
        ])
      );

      const assetUsdPrices = Object.fromEntries(assetAndUsdPrices);

      return await Promise.all(
        terms.map(async (term) => {
          const liquidity = await liquidityProviderBalance(chain);

          const tvlUsd =
            (term.depositedAmount * assetUsdPrices[term.underlying]) /
              `1e${term.underlyingDecimals}` +
            (liquidity * assetUsdPrices[term.underlying]) /
              `1e${term.underlyingDecimals}`;

          const _earnedYield = await earnedYield(chain, terms, term.id);

          return {
            pool: `${term.id}`.toLowerCase(),
            chain: chain.name,
            project: 'barnbridge',
            symbol: term.underlyingSymbol,
            poolMeta: term.assetName,
            tvlUsd,
            apyBase: apyBase(term, _earnedYield),
            underlyingTokens: [term.underlying],
            url: `https://app.barnbridge.com/fixed-yield/pools/details/?id=${term.id}&chainId=${chain.id}`,
          };
        })
      );
    })
  );

  return pools.flat();
};

module.exports = {
  apy,
  url: 'https://app.barnbridge.com/fixed-yield/pools/',
  timetravel: false,
};
