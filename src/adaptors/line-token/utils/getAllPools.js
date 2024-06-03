const sdk = require('@defillama/sdk');

const lineAbi = require('../abi/lineAbi');
const { LINE_CONTRACT_ADDRESS, CHAIN } = require('../config');

module.exports = async function getAllPools() {
  return (
    await sdk.api.abi.call({
      target: LINE_CONTRACT_ADDRESS,
      abi: lineAbi.find((m) => m.name === 'getAllPools'),
      chain: CHAIN,
    })
  ).output.map(
    ([
      [
        exists,
        reward_share10000,
        last_total_reward,
        total_pool_reward_per_token,
        total_staked_in_pool,
      ],
      poolContractAddress,
    ]) => ({
      exists,
      reward_share10000,
      last_total_reward,
      total_pool_reward_per_token,
      total_staked_in_pool,
      poolContractAddress,
    })
  );
};
