const sdk = require('@defillama/sdk');
const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');

const STONE_VAULT = '0xc5c6cB88598203f3652E531dbb1128Ff52F38621';
const CHAIN = 'ethereum';

// Underlying yield-bearing tokens deposited into the vault
const SPARK_DAI = '0x4DEDf26112B3Ec8eC46e7E31EA5e123490B05B8B';
const AAVE_LUSD = '0x3Fe6a295459FAe07DF8A0ceCC36F37160FE86AA9';
const SCRVUSD = '0x0655977FEb2f289A4aB78af67BAB0d17aAb84367';

const DAY = 24 * 3600;

async function getBlock(timestamp) {
  const { data } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${timestamp}`
  );
  return data.height;
}

async function getTotalAssets(block) {
  const { output } = await sdk.api.abi.call({
    target: STONE_VAULT,
    abi: 'uint256:totalAssets',
    chain: CHAIN,
    block,
  });
  return new BigNumber(output);
}

async function getTotalSupply(block) {
  const { output } = await sdk.api.abi.call({
    target: STONE_VAULT,
    abi: 'uint256:totalSupply',
    chain: CHAIN,
    block,
  });
  return new BigNumber(output);
}

async function apy() {
  const timestamp = Math.floor(Date.now() / 1e3);

  const [blockNow, blockYesterday] = await Promise.all([
    getBlock(timestamp),
    getBlock(timestamp - DAY),
  ]);

  const [assetsNow, supplyNow, assetsYesterday, supplyYesterday] =
    await Promise.all([
      getTotalAssets(blockNow),
      getTotalSupply(blockNow),
      getTotalAssets(blockYesterday),
      getTotalSupply(blockYesterday),
    ]);

  // Share price = totalAssets / totalSupply
  // APY = ((priceNow / priceYesterday) ^ 365 - 1) * 100
  const priceNow = assetsNow.div(supplyNow);
  const priceYesterday = assetsYesterday.div(supplyYesterday);

  let apyBase = 0;
  if (priceYesterday.gt(0) && priceNow.gt(priceYesterday)) {
    apyBase =
      (priceNow.div(priceYesterday).toNumber() ** 365 - 1) * 100;
  }

  // TVL in USD via DeFiLlama price API
  const tokens = [SPARK_DAI, AAVE_LUSD, SCRVUSD].map(
    (t) => `${CHAIN}:${t}`
  );

  const { data: priceData } = await axios.get(
    `https://coins.llama.fi/prices/current/${tokens.join(',')}`
  );

  // Get token balances held by the vault
  const balances = await Promise.all(
    [SPARK_DAI, AAVE_LUSD, SCRVUSD].map(async (token) => {
      const { output } = await sdk.api.abi.call({
        target: token,
        abi: 'erc20:balanceOf',
        params: [STONE_VAULT],
        chain: CHAIN,
        block: blockNow,
      });
      return { token, balance: new BigNumber(output) };
    })
  );

  let tvlUsd = 0;
  for (const { token, balance } of balances) {
    const key = `${CHAIN}:${token}`;
    const price = priceData.coins[key]?.price ?? 0;
    const decimals = priceData.coins[key]?.decimals ?? 18;
    tvlUsd += balance.div(10 ** decimals).times(price).toNumber();
  }

  return [
    {
      pool: `${STONE_VAULT}-${CHAIN}`,
      chain: 'Ethereum',
      project: 'stone-vault',
      symbol: 'SVT',
      tvlUsd,
      apyBase,
      underlyingTokens: [SPARK_DAI, AAVE_LUSD, SCRVUSD],
      poolMeta: 'Spark/Aave/Curve stablecoin yield aggregator',
      url: 'https://stva.io',
    },
  ];
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://stva.io',
};
