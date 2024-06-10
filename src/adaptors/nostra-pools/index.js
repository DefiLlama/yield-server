const axios = require('axios');
const { addAddressPadding } = require('starknet');
const { call } = require('../../helper/starknet');
const abi = require('./abi');

const factory =
  '0x02a93ef8c7679a5f9b1fcf7286a6e1cadf2e9192be4bcb5cb2d1b39062697527';
const strk =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const api = 'https://api.nostra.finance/query/pool_aprs';

async function apy() {
  const { pairs } = await call({
    target: factory,
    abi: abi.factory.all_pairs,
  });
  const { data: pools_data } = await axios.get(api);

  return pairs
    .map((pair) => {
      const pairAddress = addAddressPadding(`0x${pair.toString(16)}`);
      const pool_data = pools_data[pairAddress];

      if (!pool_data) {
        return null;
      }

      const { id, tokenAAddress, tokenBAddress, tvl, baseApr, rewardApr } =
        pool_data;

      return {
        pool: pairAddress,
        project: 'nostra-pools',
        symbol: id === 'UNOPSM' ? 'UNO-USDC' : id.replace('-DEGEN', ''),
        chain: 'Starknet',
        apyBase: +baseApr * 100,
        apyReward: +rewardApr * 100,
        rewardTokens: rewardApr !== '0' ? [strk] : [],
        tvlUsd: +tvl,
        underlyingTokens: [tokenAAddress, tokenBAddress],
        url:
          id === 'UNOPSM'
            ? 'https://app.nostra.finance/uno'
            : `https://app.nostra.finance/pools/${id}/deposit`,
      };
    })
    .filter((x) => x !== null);
}

module.exports = {
  apy,
  url: 'https://app.nostra.finance',
};
