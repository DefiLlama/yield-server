const fetch = require('node-fetch');

const utils = require('../utils');

const baseUrl = 'https://api.solend.fi';
const configEndpoint = `${baseUrl}/v1/markets/configs`;
const reservesEndpoint = `${baseUrl}/v1/reserves`;

const main = async () => {
  const configResponse = await fetch(`${configEndpoint}?deployment=production`);

  const config = await configResponse.json();

  const reservesConfigs = config.flatMap((market) =>
    market.reserves.map((reserve) => ({
      ...reserve,
      marketName: market.name,
    }))
  );

  // note(slasher): seems like the solend team has made changes to the reserveEndpoint, splitting up requests
  const tokenIds = reservesConfigs.map((reserve) => reserve.address);
  const reserves = [];
  const maxIds = 50;
  for (let i = 0; i <= tokenIds.length; i += maxIds) {
    const tokens = tokenIds.slice(i, i + maxIds).join(',');
    const reservesResponse = await fetch(`${reservesEndpoint}?ids=${tokens}`);
    const res = (await reservesResponse.json()).results;

    if (res === undefined) continue;
    reserves.push(res);
  }

  return reserves.flat().map((reserveData, index) => {
    const reserveConfig = reservesConfigs[index];
    const liquidity = reserveData.reserve.liquidity;
    const collateral = reserveData.reserve.collateral;
    const apyBase = Number(reserveData.rates.supplyInterest);
    const apyBaseBorrow = Number(reserveData.rates.borrowInterest);
    const apyReward = reserveData.rewards.reduce(
      (acc, reward) =>
        reward.side === 'supply' ? (Number(reward.apy) || 0) + acc : acc,
      0
    );
    const apyRewardBorrow = reserveData.rewards.reduce(
      (acc, reward) =>
        reward.side === 'borrow' ? (Number(reward.apy) || 0) + acc : acc,
      0
    );

    const rewardTokens = reserveData.rewards
      .filter((r) => r.side == 'supply')
      .map((r) =>
        r?.rewardMint === 'SLND_OPTION'
          ? 'SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp'
          : r?.rewardMint
      );
    const secondaryString =
      reserveConfig.marketName.charAt(0).toUpperCase() +
      reserveConfig.marketName.slice(1) +
      ' Pool';

    // available liquidity
    const tvlUsd =
      (Number(liquidity.availableAmount) / 10 ** liquidity.mintDecimals) *
      (liquidity.marketPrice / 10 ** 18);

    // total borrow
    const totalBorrowUsd =
      (Number(liquidity.borrowedAmountWads / 1e18) /
        10 ** liquidity.mintDecimals) *
      (liquidity.marketPrice / 10 ** 18);

    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    return {
      pool: reserveConfig.address,
      chain: utils.formatChain('solana'),
      project: 'save',
      symbol: `${reserveConfig.liquidityToken.symbol}`,
      poolMeta: secondaryString,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? rewardTokens : [],
      underlyingTokens: [reserveData.reserve.liquidity.mintPubkey],
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: apyRewardBorrow > 0 ? apyRewardBorrow : null,
      ltv: reserveData.reserve.config.loanToValueRatio / 100,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://solend.fi/pools',
};
