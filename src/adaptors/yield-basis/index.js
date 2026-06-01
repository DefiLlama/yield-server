const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = 'yield-basis';
const URL = 'https://app.yieldbasis.com/';
const FACTORY = '0x370a449FeBb9411c95bf897021377fe0B7D100c0';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;
const ONE = new BigNumber(1e18);

const MARKET_IDS = [
  { id: 7, label: 'WBTC' },
  { id: 8, label: 'cbBTC' },
  { id: 9, label: 'tBTC' },
  { id: 10, label: 'WETH' },
];

const ABI = {
  markets:
    'function markets(uint256 arg0) view returns ((address asset_token, address cryptopool, address amm, address lt, address price_oracle, address virtual_pool, address staker))',
  gaugeController: 'address:gauge_controller',
  token: 'address:TOKEN',
  previewEmissions:
    'function preview_emissions(address gauge, uint256 at_time) view returns (uint256)',
  pricePerShare: 'uint256:pricePerShare',
  totalSupply: 'erc20:totalSupply',
  symbol: 'erc20:symbol',
  updatedBalances:
    'function updated_balances() view returns (uint256 supply, uint256 staker_balance)',
};

const isAddress = (address) =>
  typeof address === 'string' &&
  /^0x[0-9a-fA-F]{40}$/.test(address) &&
  address.toLowerCase() !== ZERO_ADDRESS;

const tupleValue = (value, key, index) => value?.[key] ?? value?.[index];

const toAddress = (value) =>
  isAddress(value) ? value.toLowerCase() : ZERO_ADDRESS;

const toBigNumber = (value) => {
  try {
    return new BigNumber(value == null ? 0 : value.toString());
  } catch (_) {
    return new BigNumber(0);
  }
};

const annualize = (current, previous, days) => {
  if (!current || !previous || previous.lte(0) || current.lte(0)) return 0;
  const ratio = current.div(previous).toNumber();
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return (Math.pow(ratio, DAYS_PER_YEAR / days) - 1) * 100;
};

const getBlock = async (timestamp) => {
  const { data } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${timestamp}`,
    { timeout: 10_000 }
  );
  return data.height;
};

const multiCall = async ({ abi, calls, block, permitFailure = true }) => {
  const { output } = await sdk.api.abi.multiCall({
    abi,
    calls,
    chain: CHAIN,
    block,
    permitFailure,
  });
  return output.map((entry) => entry?.output ?? null);
};

const getMarkets = async () => {
  const markets = await multiCall({
    abi: ABI.markets,
    calls: MARKET_IDS.map(({ id }) => ({ target: FACTORY, params: [id] })),
  });

  return markets
    .map((market, index) => ({
      id: MARKET_IDS[index].id,
      label: MARKET_IDS[index].label,
      asset: toAddress(tupleValue(market, 'asset_token', 0)),
      cryptopool: toAddress(tupleValue(market, 'cryptopool', 1)),
      lt: toAddress(tupleValue(market, 'lt', 3)),
      staker: toAddress(tupleValue(market, 'staker', 6)),
    }))
    .filter((market) => isAddress(market.asset) && isAddress(market.lt));
};

const getTokenPrices = async (tokens) => {
  const uniqueTokens = [...new Set(tokens.filter(isAddress))];
  if (uniqueTokens.length === 0) return {};
  return (await utils.getPrices(uniqueTokens, CHAIN)).pricesByAddress;
};

const getUnstakedRows = ({
  markets,
  prices,
  ppsNow,
  pps1d,
  pps7d,
  updatedBalances,
  totalSupplies,
  ltSymbols,
}) =>
  markets
    .map((market, index) => {
      const assetPrice = prices[market.asset];
      const pricePerShare = toBigNumber(ppsNow[index]);
      const totalSupply = toBigNumber(totalSupplies[index]);
      const updated = updatedBalances[index];
      const updatedSupply = toBigNumber(
        tupleValue(updated, 'supply', 0) ?? totalSupply
      );
      const stakedBalance = BigNumber.min(
        toBigNumber(tupleValue(updated, 'staker_balance', 1)),
        updatedSupply
      );
      const unstakedBalance = BigNumber.max(
        updatedSupply.minus(stakedBalance),
        0
      );

      if (
        !Number.isFinite(assetPrice) ||
        assetPrice <= 0 ||
        totalSupply.lte(0) ||
        pricePerShare.lte(0) ||
        unstakedBalance.lte(0)
      )
        return null;

      const tvlUsd = unstakedBalance
        .div(ONE)
        .times(pricePerShare.div(ONE))
        .times(assetPrice)
        .toNumber();

      if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return null;

      const symbol = ltSymbols[index] || `yb-${market.label}`;
      const pps = pricePerShare.div(ONE).toNumber();

      return {
        pool: `${market.lt}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol,
        tvlUsd,
        apyBase: annualize(pricePerShare, toBigNumber(pps1d[index]), 1),
        apyBase7d: annualize(pricePerShare, toBigNumber(pps7d[index]), 7),
        ...(pps > 0 && { pricePerShare: pps }),
        underlyingTokens: [market.asset],
        token: market.lt,
        poolMeta: `Unstaked LT, market #${market.id}, Curve pool ${market.cryptopool}`,
        url: URL,
      };
    })
    .filter(Boolean);

const getStakedRows = ({
  markets,
  prices,
  ybToken,
  ppsNow,
  updatedBalances,
  emissionsNow,
  emissions1d,
  ltSymbols,
}) => {
  const ybPrice = prices[ybToken];
  if (!Number.isFinite(ybPrice) || ybPrice <= 0) return [];

  return markets
    .map((market, index) => {
      if (!isAddress(market.staker)) return null;

      const assetPrice = prices[market.asset];
      const pricePerShare = toBigNumber(ppsNow[index]);
      const updated = updatedBalances[index];
      const stakedBalance = toBigNumber(
        tupleValue(updated, 'staker_balance', 1)
      );
      const dailyRewards = BigNumber.max(
        toBigNumber(emissions1d[index]).minus(toBigNumber(emissionsNow[index])),
        0
      );

      if (
        !Number.isFinite(assetPrice) ||
        assetPrice <= 0 ||
        pricePerShare.lte(0) ||
        stakedBalance.lte(0) ||
        dailyRewards.lte(0)
      )
        return null;

      const stakedTvlUsd = stakedBalance
        .div(ONE)
        .times(pricePerShare.div(ONE))
        .times(assetPrice)
        .toNumber();
      const rewardUsdPerDay = dailyRewards.div(ONE).times(ybPrice).toNumber();
      const apyReward =
        stakedTvlUsd > 0
          ? (rewardUsdPerDay * DAYS_PER_YEAR * 100) / stakedTvlUsd
          : 0;

      if (!Number.isFinite(stakedTvlUsd) || !Number.isFinite(apyReward))
        return null;

      const symbol = ltSymbols[index] || `yb-${market.label}`;

      return {
        pool: `${market.staker}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol,
        tvlUsd: stakedTvlUsd,
        apyReward,
        rewardTokens: [ybToken],
        underlyingTokens: [market.asset],
        token: market.staker,
        poolMeta: `Staked gauge, market #${market.id}, Curve pool ${market.cryptopool}`,
        url: URL,
      };
    })
    .filter(Boolean);
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [blockNow, block1d, block7d, markets, gaugeController] =
    await Promise.all([
      getBlock(now),
      getBlock(now - DAY),
      getBlock(now - 7 * DAY),
      getMarkets(),
      sdk.api.abi
        .call({ target: FACTORY, abi: ABI.gaugeController, chain: CHAIN })
        .then((res) => toAddress(res.output)),
    ]);

  const ybToken = isAddress(gaugeController)
    ? await sdk.api.abi
        .call({ target: gaugeController, abi: ABI.token, chain: CHAIN })
        .then((res) => toAddress(res.output))
    : ZERO_ADDRESS;

  const ltCalls = markets.map((market) => ({ target: market.lt }));
  const stakerCalls = markets.map((market) => ({ target: market.staker }));

  const [
    prices,
    ppsNow,
    pps1d,
    pps7d,
    totalSupplies,
    updatedBalances,
    ltSymbols,
    emissionsNow,
    emissions1d,
  ] = await Promise.all([
    getTokenPrices([...markets.map((market) => market.asset), ybToken]),
    multiCall({ abi: ABI.pricePerShare, calls: ltCalls, block: blockNow }),
    multiCall({ abi: ABI.pricePerShare, calls: ltCalls, block: block1d }),
    multiCall({ abi: ABI.pricePerShare, calls: ltCalls, block: block7d }),
    multiCall({ abi: ABI.totalSupply, calls: ltCalls, block: blockNow }),
    multiCall({ abi: ABI.updatedBalances, calls: ltCalls, block: blockNow }),
    multiCall({ abi: ABI.symbol, calls: ltCalls, block: blockNow }).then(
      (symbols) =>
        symbols.map((symbol) => (typeof symbol === 'string' ? symbol : null))
    ),
    isAddress(gaugeController)
      ? multiCall({
          abi: ABI.previewEmissions,
          calls: stakerCalls.map((call) => ({
            target: gaugeController,
            params: [call.target, now],
          })),
          block: blockNow,
        })
      : [],
    isAddress(gaugeController)
      ? multiCall({
          abi: ABI.previewEmissions,
          calls: stakerCalls.map((call) => ({
            target: gaugeController,
            params: [call.target, now + DAY],
          })),
          block: blockNow,
        })
      : [],
  ]);

  return [
    ...getUnstakedRows({
      markets,
      prices,
      ppsNow,
      pps1d,
      pps7d,
      updatedBalances,
      totalSupplies,
      ltSymbols,
    }),
    ...getStakedRows({
      markets,
      prices,
      ybToken,
      ppsNow,
      updatedBalances,
      emissionsNow,
      emissions1d,
      ltSymbols,
    }),
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: URL,
};
