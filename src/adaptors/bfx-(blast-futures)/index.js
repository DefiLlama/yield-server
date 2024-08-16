const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');

const CHAIN = 'blast';
const USDB = '0x4300000000000000000000000000000000000003';
const API_URL = 'https://api.bfx.trade/vaults';

const getApy = async () => {
  let pools = [];

  const response = await axios.get(API_URL, {
    headers: { eid: 'bfx' },
  });
  pools = response.data.result;

  const tvl = (
    await sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: USDB,
      params: '0x3Ba925fdeAe6B46d0BB4d424D829982Cb2F7309e',
      chain: 'blast',
    })
  ).output;

  const tvlValue = Number(tvl) / 1e18;

  return pools.map((p) => ({
    chain: utils.formatChain(CHAIN),
    project: 'bfx-(blast-futures)',
    pool: 'Dynamic AMM LP',
    symbol: 'USDB',
    tvlUsd: tvlValue * Number(p.share_price),
    apyBase: Number(p.apy) * 100,
    apyReward: Number('0.15') * 100,
    rewardTokens: [USDB],
    poolMeta: `Dynamic Market Maker`,
    url: `https://bfx.trade/vaults/platformOverview?vault_wallet=0x2688c2bb0eeea0cd10de520699090a36469d788a`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://bfx.trade/vaults',
};
