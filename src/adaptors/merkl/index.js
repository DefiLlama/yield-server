const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { networks } = require('./config');

// Protocols that should not be listed under Merkl
// as they already have their own adapters.
const protocolsBlacklist = [
  'euler',
  'crosscurve',
  'aerodrome',
  'gamma',
  'uniswap',
];

// Allow specific pools from blacklisted protocols
const poolsWhitelist = [
  // Pool from Aerodrome CL: xPufETH-WETH
  '0xCDf927C0F7b81b146C0C9e9323eb5A28D1BFA183',
];

async function getRateAngle(token) {
  const prices = await utils.getData('https://api.angle.money/v1/prices/');
  const price = prices.filter((p) => p.token == token)[0]?.rate;
  return price;
}

// function getting all the data from the Angle API
const main = async () => {
  var poolsData = [];

  const project = 'merkl';

  for (const chainId of Object.keys(networks)) {
    const chain = networks[chainId];

    let pools = [];
    let pageI = 0;

    while (true) {
      let data;
      try {
        data = await utils.getData(
          `https://api.merkl.xyz/v4/opportunities?chainId=${chainId}&status=LIVE,PAST&items=100&page=${pageI}`
        );
      } catch (err) {
        console.log('failed to fetch Merkl data on chain ' + chain);
        break;
      }

      if (data.length === 0) {
        break;
      }

      pools.push(...data);
      pageI++;
    }

    for (const pool of pools.filter(
      (x) =>
        !x.protocol ||
        !protocolsBlacklist.includes(x.protocol.id) ||
        poolsWhitelist.includes(x.identifier)
    )) {
      try {
        const poolAddress = pool.identifier;

        let symbol = pool.tokens.map((x) => x.symbol).join('-');

        if (!symbol.length) {
          symbol = (
            await sdk.api.abi.call({
              target: pool.depositUrl.split('/').slice(-1)[0],
              chain,
              abi: 'erc20:symbol',
            })
          ).output;
        }

        const underlyingTokens = pool.tokens.map((x) => x.address);

        const tvlUsd = pool.tvl;

        const rewardTokens =
          pool.rewardsRecord?.breakdowns.map((x) => x.token.address) || [];
        const apyReward = pool.apr;

        const poolData = {
          pool: `${poolAddress}-merkl`,
          chain: chain,
          project: project,
          poolMeta: pool.status === 'PAST' ? 'past' : undefined,
          symbol: symbol,
          tvlUsd: tvlUsd ?? 0,
          apyReward: apyReward ?? 0,
          rewardTokens: [...new Set(rewardTokens)],
          underlyingTokens: underlyingTokens,
        };
        poolsData.push(poolData);
      } catch {}
    }
  }
  return utils.removeDuplicates(poolsData.filter((p) => utils.keepFinite(p)));
};

/*
main().then((data) => {
  console.log(data);
});
*/

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.merkl.xyz/',
};
