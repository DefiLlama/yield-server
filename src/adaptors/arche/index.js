const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const VAULT = '0x33FfC177A7278FF84aaB314A036bC7b799B7Cc15';
const STRATEGY = '0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204'; // yvUSDC-1
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CHAIN = 'ethereum';
const DAY = 24 * 3600;

// Yearn v3 vaults book strategy yield only when process_report() runs (lazy
// accounting). Reading vault.totalAssets() / convertToAssets() between reports
// therefore lags real underlying yield. To get an honest on-chain rate we
// mark-to-market the strategy holdings:
//   real_assets = totalIdle + yvUSDC.convertToAssets(yvUSDC.balanceOf(vault))
//   real_pps    = real_assets / vault.totalSupply()
async function realPricePerShare(block) {
  const [idle, supply, stratBal] = await Promise.all([
    sdk.api.abi.call({ target: VAULT, abi: 'uint256:totalIdle', chain: CHAIN, block }),
    sdk.api.abi.call({ target: VAULT, abi: 'uint256:totalSupply', chain: CHAIN, block }),
    sdk.api.abi.call({
      target: STRATEGY,
      abi: 'function balanceOf(address) view returns (uint256)',
      params: [VAULT],
      chain: CHAIN,
      block,
    }),
  ]);
  const { output: stratValue } = await sdk.api.abi.call({
    target: STRATEGY,
    abi: 'function convertToAssets(uint256 shares) view returns (uint256)',
    params: [stratBal.output],
    chain: CHAIN,
    block,
  });
  return (Number(idle.output) + Number(stratValue)) / Number(supply.output);
}

const getApy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  const sevenDaysAgo = now - 7 * DAY;

  const [blockNow, block7d] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/${CHAIN}/${now}`).then((r) => r.data.height),
    axios.get(`https://coins.llama.fi/block/${CHAIN}/${sevenDaysAgo}`).then((r) => r.data.height),
  ]);

  const [ppsNow, pps7d, totalAssets] = await Promise.all([
    realPricePerShare(blockNow),
    realPricePerShare(block7d),
    sdk.api.abi.call({
      target: VAULT,
      abi: 'uint256:totalAssets',
      chain: CHAIN,
      block: blockNow,
    }),
  ]);

  const apyBase = ((ppsNow / pps7d) ** (365 / 7) - 1) * 100;
  if (!Number.isFinite(apyBase)) {
    throw new Error(`arche apyBase non-finite: ${apyBase}`);
  }

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'arche',
      symbol: utils.formatSymbol('arUSD'),
      tvlUsd: Number(totalAssets.output) / 1e6,
      apyBase,
      pricePerShare: ppsNow,
      underlyingTokens: [utils.formatAddress(USDC)],
      token: utils.formatAddress(VAULT),
      url: 'https://arche.money',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://arche.money',
};
