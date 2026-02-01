const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const utils = require('../utils');
const ABI = require('./abi');
const { default: BigNumber } = require('bignumber.js');

const gammaMerklesOpportunities = [
  {
    id: '646147034480640434'
  },
];

const getApy = async () => {
  return (
    await Promise.all(
      gammaMerklesOpportunities
        .map(async (gammaMerkleOpportunity) => {
          try {
            const merkleData = await utils.getData(`https://api.merkl.xyz/v4/opportunities/${gammaMerkleOpportunity.id}`);
            const chainId = merkleData.chain.id;
            const chainName = merkleData.chain.name.toLowerCase();
            const tvlUsd = merkleData.tvl;
            const apr = merkleData.apr;
            const rewardTokenAddress =
              merkleData.rewardsRecord.breakdowns[0].token.address;
            const identifier = merkleData.identifier;
            const stakedTokenSymbol = merkleData.tokens[0].symbol;
            const url = merkleData.depositUrl;

            const token0Address = (
              await sdk.api.abi.call({
                target: identifier,
                abi: 'address:token0',
                chain: chainName,
              })
            ).output;

            const token1Address = (
              await sdk.api.abi.call({
                target: identifier,
                abi: 'address:token1',
                chain: chainName,
              })
            ).output;


            return {
              pool: `${identifier}-${chainName}`.toLowerCase(),
              chain: utils.formatChain(chainName),
              project: 'betswirl',
              symbol: utils.formatSymbol(stakedTokenSymbol),
              tvlUsd: tvlUsd,
              apy: apr,
              rewardTokens: [rewardTokenAddress],
              underlyingTokens: [token0Address, token1Address],
              poolMeta: `Gamma vault ${stakedTokenSymbol}`,
              url: url
            };
          } catch (error) {
            console.error(`Error processing opportunity ${gammaMerkleOpportunity.id}:`, error);
            return null;
          }
        })
    )
  ).filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: getApy
};
