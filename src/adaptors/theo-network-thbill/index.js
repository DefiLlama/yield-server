const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const project = 'theo-network-thbill';
const symbol = 'thBILL';

const config = {
  ethereum: '0x5FA487BCa6158c64046B2813623e20755091DA0b',
  arbitrum: '0xfDD22Ce6D1F66bc0Ec89b20BF16CcB6670F55A5a',
  base: '0xfDD22Ce6D1F66bc0Ec89b20BF16CcB6670F55A5a',
  hyperliquid: '0xfDD22Ce6D1F66bc0Ec89b20BF16CcB6670F55A5a',
};

// Ethereum contract is the canonical source for exchange rate (ERC-4626)
const CANONICAL_TOKEN = config.ethereum;

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`)
    .then((r) => r.data.height);

const getExchangeRate = (block) =>
  sdk.api.abi.call({
    target: CANONICAL_TOKEN,
    chain: 'ethereum',
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    params: [1e6],
    block,
  });

const apy = async () => {
  // Fetch total supply on each chain
  const supplies = await Promise.all(
    Object.entries(config).map(async ([chain, address]) => {
      const result = await sdk.api.erc20.totalSupply({
        target: address,
        chain,
      });
      return [chain, result.output / 1e6];
    })
  );

  // Get blocks for APY calculation
  const timestampNow = Math.floor(Date.now() / 1000);
  const [blockNow, block7d, block30d] = await Promise.all([
    getBlock(timestampNow),
    getBlock(timestampNow - 86400 * 7),
    getBlock(timestampNow - 86400 * 30),
  ]);

  // Fetch exchange rates at different points in time
  const [rateNow, rate7d, rate30d] = await Promise.all([
    getExchangeRate(blockNow),
    getExchangeRate(block7d),
    getExchangeRate(block30d),
  ]);

  const rateNowNum = rateNow.output / 1e6;
  const rate7dNum = rate7d.output / 1e6;
  const rate30dNum = rate30d.output / 1e6;

  const apyBase7d =
    ((rateNowNum - rate7dNum) / rate7dNum) * (365 / 7) * 100;
  const apyBase =
    ((rateNowNum - rate30dNum) / rate30dNum) * (365 / 30) * 100;

  const pools = supplies.map(([chain, supply]) => ({
    pool: `${config[chain]}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project,
    symbol,
    tvlUsd: supply * rateNowNum,
    apyBase,
    apyBase7d,
    underlyingTokens: [config[chain]],
  }));

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.theo.xyz',
};
