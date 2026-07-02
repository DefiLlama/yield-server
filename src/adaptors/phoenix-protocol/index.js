const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

const CHAIN = 'ethereum';
const PHLIMBO = '0x6084a02c2ac0127ddf1e617de257c61480a2aee0';
const PHUSD = '0xf3B5B661b92B75C71fA5Aba8Fd95D7514A9CD605';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SUSDS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD';
const BALANCER_POOL = '0x642BB6860b4776CC10b26B8f361Fd139E7f0db04';
const BALANCER_VAULT = '0xbA1333333333a1BA1108E8412f11850A5C319bA9';

const SECONDS_PER_YEAR = 31_536_000;

const getPoolTokensAbi = {
  inputs: [{ internalType: 'address', name: 'pool', type: 'address' }],
  name: 'getPoolTokens',
  outputs: [{ internalType: 'contract IERC20[]', name: '', type: 'address[]' }],
  stateMutability: 'view',
  type: 'function',
};

const getCurrentLiveBalancesAbi = {
  inputs: [{ internalType: 'address', name: 'pool', type: 'address' }],
  name: 'getCurrentLiveBalances',
  outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
  stateMutability: 'view',
  type: 'function',
};

const callView = (target, abi, params) =>
  sdk.api.abi
    .call({ target, abi, params, chain: CHAIN })
    .then((r) => r.output);

const getPrices = async (tokens) => {
  const keys = tokens.map((t) => `${CHAIN}:${t}`);
  const { data } = await axios.get(
    getPriceApiUrl(`/prices/current/${keys.join(',')}`),
    { timeout: 10_000 }
  );
  return tokens.reduce((acc, t, i) => {
    const coin = data.coins[keys[i]];
    if (!coin) throw new Error(`missing DefiLlama price for ${keys[i]}`);
    acc[t.toLowerCase()] = coin.price;
    return acc;
  }, {});
};

// phUSD is not listed on the DefiLlama price API, so derive its USD value from
// the Balancer V3 phUSD/sUSDS spot ratio scaled by the DefiLlama sUSDS price
// (which already reflects the sUSDS->USDS ERC4626 rate and the USDS market price).
const getPhUsdPrice = async (sUsdsPrice) => {
  const [tokens, balances] = await Promise.all([
    callView(BALANCER_VAULT, getPoolTokensAbi, [BALANCER_POOL]),
    callView(BALANCER_VAULT, getCurrentLiveBalancesAbi, [BALANCER_POOL]),
  ]);

  const lc = (a) => String(a).toLowerCase();
  const idxSusds = tokens.findIndex((t) => lc(t) === lc(SUSDS));
  const idxPhusd = tokens.findIndex((t) => lc(t) === lc(PHUSD));
  if (idxSusds < 0 || idxPhusd < 0) {
    throw new Error('phUSD/sUSDS not found in Balancer pool');
  }

  const sUsdsBalance = Number(balances[idxSusds]);
  const phUsdBalance = Number(balances[idxPhusd]);
  if (!(sUsdsBalance > 0) || !(phUsdBalance > 0)) {
    throw new Error('Balancer pool has zero balance');
  }

  const phUsdPriceInSUsds = sUsdsBalance / phUsdBalance;
  return phUsdPriceInSUsds * sUsdsPrice;
};

const apy = async () => {
  const prices = await getPrices([SUSDS, USDC]);

  const [totalStaked, desiredAPYBps, rewardPerSecond, phUsdPrice] =
    await Promise.all([
      callView(PHLIMBO, 'uint256:totalStaked'),
      callView(PHLIMBO, 'uint256:desiredAPYBps'),
      callView(PHLIMBO, 'uint256:rewardPerSecond'),
      getPhUsdPrice(prices[SUSDS.toLowerCase()]),
    ]);

  const stakedAmount = Number(totalStaked) / 1e18;
  const tvlUsd = stakedAmount * phUsdPrice;

  let usdcApy = 0;
  if (tvlUsd > 0) {
    // rewardPerSecond is the live USDC emission rate: USDC (6 decimals) per
    // second, scaled by a further 1e18 of fixed-point precision (=> /1e24).
    const usdcPerYearUsd =
      (Number(rewardPerSecond) / 1e24) *
      SECONDS_PER_YEAR *
      prices[USDC.toLowerCase()];
    usdcApy = (usdcPerYearUsd / tvlUsd) * 100;
  }
  const phusdApy = Number(desiredAPYBps) / 100;
  const apyReward = usdcApy + phusdApy;

  return [
    {
      pool: `${PHLIMBO}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'phoenix-protocol',
      symbol: 'phUSD',
      tvlUsd,
      apyBase: null,
      apyReward,
      rewardTokens: [USDC, PHUSD],
      underlyingTokens: [PHUSD],
      poolMeta: 'Staking',
      url: 'https://phusd.behodler.io/staking',
    },
  ];
};

module.exports = {
  protocolId: '7703',
  timetravel: false,
  apy,
  url: 'https://phusd.behodler.io/staking',
};
