const sdk = require('@defillama/sdk');

const CHAIN = 'ethereum';
const PHLIMBO = '0x3984eBC84d45a889dDAc595d13dc0aC2E54819F4';
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

const getPhUsdPrice = async () => {
  try {
    const [tokens, balances, sharesToAssets] = await Promise.all([
      callView(BALANCER_VAULT, getPoolTokensAbi, BALANCER_POOL),
      callView(BALANCER_VAULT, getCurrentLiveBalancesAbi, BALANCER_POOL),
      callView(SUSDS, 'function convertToAssets(uint256) view returns (uint256)', [
        '1000000000000000000',
      ]),
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
    const usdsPerSUsds = Number(sharesToAssets) / 1e18;
    return phUsdPriceInSUsds * usdsPerSUsds;
  } catch (err) {
    console.warn(
      `[phoenix-protocol] phUSD pricing failed (${err.message}); falling back to $1`
    );
    return 1;
  }
};

const apy = async () => {
  const [
    totalStaked,
    desiredAPYBps,
    rewardBalance,
    depletionDuration,
    phUsdPrice,
  ] = await Promise.all([
    callView(PHLIMBO, 'uint256:totalStaked'),
    callView(PHLIMBO, 'uint256:desiredAPYBps'),
    callView(PHLIMBO, 'uint256:rewardBalance'),
    callView(PHLIMBO, 'uint256:depletionDuration'),
    getPhUsdPrice(),
  ]);

  const stakedAmount = Number(totalStaked) / 1e18;
  const tvlUsd = stakedAmount * phUsdPrice;

  let usdcApy = 0;
  if (tvlUsd > 0 && Number(depletionDuration) > 0) {
    const usdcPerYearUsd =
      ((Number(rewardBalance) / Number(depletionDuration)) * SECONDS_PER_YEAR) /
      1e6;
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
  timetravel: false,
  apy,
  url: 'https://phusd.behodler.io/staking',
};
