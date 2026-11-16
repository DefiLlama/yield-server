// documentation:
// https://wiki.sovryn.com/en/technical-documents/amm/AMM-FAQ

const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { tokensPool } = require('./address');

// bridged tokens with no rsk price on coins.llama.fi
const priceKeys = {
  '0xef213441a85df4d7acbdae0cf78004e1e486bb96': 'coingecko:tether', // rUSDT
  '0x6d9659bdf5b1a1da217f7bbaf7dbaf8190e2e71b': 'coingecko:binancecoin', // BNBs
};
const priceKey = (token) => priceKeys[token] || `rsk:${token}`;

// tvl from the converters' on-chain reserves, the subgraph and graph-wrapper
// tvl feeds are unreliable
const getPoolsTvl = async (converters) => {
  const reserveCalls = (i) =>
    sdk.api.abi.multiCall({
      abi: 'function reserveTokens(uint256) view returns (address)',
      calls: converters.map((target) => ({ target, params: [i] })),
      chain: 'rsk',
    });
  const [res0, res1] = await Promise.all([reserveCalls(0), reserveCalls(1)]);
  const reserves = converters.map((_, i) => [
    res0.output[i].output.toLowerCase(),
    res1.output[i].output.toLowerCase(),
  ]);

  const tokens = [...new Set(reserves.flat())];
  const [balances, decimals, { pricesByAddress }] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: reserves.flatMap((pair, i) =>
        pair.map((target) => ({ target, params: [converters[i]] }))
      ),
      chain: 'rsk',
    }),
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((target) => ({ target })),
      chain: 'rsk',
    }),
    utils.getPrices(tokens.map(priceKey)),
  ]);
  const decimalsOf = Object.fromEntries(
    tokens.map((t, i) => [t, Number(decimals.output[i].output)])
  );

  return reserves.map((pair, i) => {
    const values = pair.map((token, j) => {
      const price = pricesByAddress[priceKey(token).split(':')[1]];
      const balance =
        balances.output[i * 2 + j].output / 10 ** decimalsOf[token];
      return price ? balance * price : null;
    });
    // an unpriced side is valued at the priced one: exact for 50/50 V1
    // converters, an estimate for V2 ones (today only BPRO lacks a price)
    const priced = values.filter((v) => v !== null);
    const tvlUsd = priced.length === 2 ? priced[0] + priced[1] : priced[0] * 2;
    return { tvlUsd, assets: pair };
  });
};

const getApy = async () => {
  const amm_pools_data = await utils.getData(`https://amm-apy.sovryn.app/amm`); // see https://github.com/DistributedCollective/sovryn-amm-apy
  const converters = Object.keys(tokensPool).filter((k) => amm_pools_data[k]); // pool dropped from amm-apy (e.g. XUSD-RBTC)
  const tvls = await getPoolsTvl(converters);

  return converters
    .map((k, i) => {
      const { tvlUsd, assets } = tvls[i];
      const apyData = amm_pools_data[k].data;
      const apyDataArray = apyData[Object.keys(apyData)[0]];
      const apy = apyDataArray[apyDataArray.length - 1];
      return {
        pool: k.toLowerCase(),
        chain: utils.formatChain('Rootstock'),
        project: 'sovryn-dex',
        tvlUsd,
        symbol: String(tokensPool[k]),
        apyBase: Number(apy.APY_fees_pc),
        apyReward: Number(apy.APY_rewards_pc),
        url: 'https://alpha.sovryn.app/yield-farm',
        rewardTokens: ['0xefc78fc7d48b64958315949279ba181c2114abbd'],
        underlyingTokens: assets,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '329',
  timetravel: false,
  apy: getApy,
  url: 'https://alpha.sovryn.app',
};
