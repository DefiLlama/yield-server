const sdk = require('@defillama/sdk');
const axios = require('axios');

const weETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';
const eETH = '0x35fA164735182de50811E8e2E824cFb9B6118ac2'
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const eigen = '0xec53bf9167f50cdeb3ae105f56099aaab9061f83';
const lrt2 = '0x8F08B70456eb22f6109F57b8fafE862ED28E6040';

const eBTC = '0x657e8C867D8B37dCC18fA4Caead9C45EB088C642';
const eBTCAccountant = '0x1b293DC39F94157fA0D1D36d7e0090C8B8B8c13F';
const LBTC = '0x8236a87084f8B84306f72007F36F2618A5634494';
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';

// Lombard API for LBTC staking APY (eBTC is backed by LBTC)
const LOMBARD_APY_API = 'https://mainnet.prod.lombard.finance/api/v1/analytics/estimated-apy?partner_id=';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: weETH,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const totalSupplyEETH =
    (
      await sdk.api.abi.call({
        target: eETH,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
  ).data.height;

  const abi = 'function getRate() external view returns (uint256)';

  const [weETHRates, eBTCRates] = await Promise.all([
    Promise.all([
      sdk.api.abi.call({ target: weETH, abi }),
      sdk.api.abi.call({ target: weETH, abi, block: block1dayAgo }),
      sdk.api.abi.call({ target: weETH, abi, block: block7dayAgo }),
    ]),
    Promise.all([
      sdk.api.abi.call({ target: eBTCAccountant, abi }),
      sdk.api.abi.call({ target: eBTCAccountant, abi, block: block1dayAgo }),
      sdk.api.abi.call({ target: eBTCAccountant, abi, block: block7dayAgo }),
    ]),
  ]);

  const apr1d =
    ((weETHRates[0].output - weETHRates[1].output) / 1e18) * 365 * 100;

  const apr7d =
    ((weETHRates[0].output - weETHRates[2].output) / 1e18 / 7) * 365 * 100;

  const eBTCRateCurrent = Number(eBTCRates[0].output);
  const eBTCRate1dAgo = Number(eBTCRates[1].output);
  const eBTCRate7dAgo = Number(eBTCRates[2].output);

  const eBTCApr1d =
    eBTCRate1dAgo > 0
      ? ((eBTCRateCurrent - eBTCRate1dAgo) / eBTCRate1dAgo) * 365 * 100
      : 0;

  const eBTCApr7d =
    eBTCRate7dAgo > 0
      ? ((eBTCRateCurrent - eBTCRate7dAgo) / eBTCRate7dAgo / 7) * 365 * 100
      : 0;


  const optimismApi = new sdk.ChainApi({ chain: 'optimism' });
  const restakingWeeklyEigen = Number(await optimismApi.call({
    target: '0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da',
    abi: 'function categoryTVL(string _category) view returns (uint256)',
    params: [eigen]
  })) / 1e18;

  const priceKey = `ethereum:${weETH}`;
  const priceKeyEigen = `ethereum:${eigen}`;
  const priceKeyEETH = `ethereum:${eETH}`;
  const priceKeyWBTC = `ethereum:${WBTC}`;

  const [eigenPriceRes, eethPriceRes, weethPriceRes, wbtcPriceRes, lombardApyRes] = await Promise.all([
    axios.get(`https://coins.llama.fi/prices/current/ethereum:${eigen}`),
    axios.get(`https://coins.llama.fi/prices/current/ethereum:${eETH}`),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(`https://coins.llama.fi/prices/current/${priceKeyWBTC}`),
    axios.get(LOMBARD_APY_API),
  ]);

  const eigenPrice = eigenPriceRes.data.coins[`ethereum:${eigen}`]?.price;
  const eethPrice = eethPriceRes.data.coins[`ethereum:${eETH}`]?.price;
  const price = weethPriceRes.data.coins[priceKey]?.price;
  const btcPrice = wbtcPriceRes.data.coins[priceKeyWBTC]?.price;

  // LBTC staking APY from Lombard API (fallback if on-chain rate hasn't changed)
  const lombardApy = (lombardApyRes.data.lbtc_estimated_apy || 0) * 100;

  const eBTCApyBase = eBTCApr1d > 0 ? eBTCApr1d : lombardApy;
  const eBTCApyBase7d = eBTCApr7d > 0 ? eBTCApr7d : lombardApy;

  const restakingApy = (restakingWeeklyEigen * eigenPrice) / 7 / (totalSupplyEETH * eethPrice) * 365 * 100;

  const eBTCTotalSupply =
    (
      await sdk.api.abi.call({
        target: eBTC,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e8;

  const eBTCTvlUsd = eBTCTotalSupply * (btcPrice || 0);

  return [
    {
      pool: weETH,
      chain: 'ethereum',
      project: 'ether.fi-stake',
      symbol: 'weETH',
      tvlUsd: totalSupply * price,
      apyBase: apr1d,
      apyBase7d: apr7d,
      apyReward: restakingApy,
      underlyingTokens: [weth],
      rewardTokens: [lrt2],
      url: 'https://ether.fi/app/weeth',
    },
    {
      pool: eBTC,
      chain: 'ethereum',
      project: 'ether.fi-stake',
      symbol: 'eBTC',
      tvlUsd: eBTCTvlUsd,
      apyBase: eBTCApyBase,
      apyBase7d: eBTCApyBase7d,
      underlyingTokens: [LBTC, WBTC],
      url: 'https://ether.fi/app/ebtc',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.ether.fi/',
};
