const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const USYC = {
  ethereum: '0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b',
  bsc: '0x8D0fA28f221eB5735BC71d3a0Da67EE5bC821311',
};
const ORACLE = '0x74f2199AEb743f68f05943e5715A33EaF2b61f53';
const project = 'circle-usyc';

const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

const apy = async () => {
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp7d = timestampNow - 86400 * 7;
  const timestamp30d = timestampNow - 86400 * 30;

  const [blockNow, block7d, block30d] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/ethereum/${timestampNow}`),
    axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7d}`),
    axios.get(`https://coins.llama.fi/block/ethereum/${timestamp30d}`),
  ]).then((res) => res.map((r) => r.data.height));

  const callOracle = (block) =>
    sdk.api.abi.call({
      target: ORACLE,
      chain: 'ethereum',
      abi: latestRoundDataAbi,
      block,
    });

  const [rateNow, rate7d, rate30d, supplyEth, supplyBsc] = await Promise.all([
    callOracle(blockNow),
    callOracle(block7d),
    callOracle(block30d),
    sdk.api.erc20.totalSupply({ target: USYC.ethereum, chain: 'ethereum' }),
    sdk.api.erc20.totalSupply({ target: USYC.bsc, chain: 'bsc' }),
  ]);

  const priceNow = rateNow.output.answer / 1e18;
  const price7d = rate7d.output.answer / 1e18;
  const price30d = rate30d.output.answer / 1e18;

  const apyBase =
    ((priceNow - price30d) / price30d) * (365 / 30) * 100;
  const apyBase7d =
    ((priceNow - price7d) / price7d) * (365 / 7) * 100;

  const pools = [];
  for (const [chain, address] of Object.entries(USYC)) {
    const supply = (chain === 'ethereum' ? supplyEth : supplyBsc).output / 1e6;
    pools.push({
      pool: `${address.toLowerCase()}-${chain}`,
      chain: utils.formatChain(chain),
      project,
      symbol: 'USYC',
      tvlUsd: supply * priceNow,
      apyBase,
      apyBase7d,
      underlyingTokens: [address],
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.circle.com/usyc',
};
