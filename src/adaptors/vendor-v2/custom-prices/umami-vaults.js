const axios = require('axios');
const { symbol } = require('@defillama/sdk/build/erc20');
const { ethers } = require('ethers');
const sdk = require('@defillama/sdk');

exports.getUmamiVaultSharePrice = async (vaultAddress, network) => {
  const symbol = (
    await sdk.api.abi.call({
      target: vaultAddress,
      abi: 'erc20:symbol',
      chain: network,
    })
  ).output;
  const decimals = Number(
    (
      await sdk.api.abi.call({
        target: vaultAddress,
        abi: 'erc20:decimals',
        chain: network,
      })
    ).output
  );
  const umamiGraphUrl =
    'https://api.thegraph.com/subgraphs/name/umamidao/glp-vaults';
  // execute price per share query
  const response = await axios.post(umamiGraphUrl, {
    query: `{
        vaultPricePerShares(
            first: 1, 
            where: {vault: "${vaultAddress}"},
            orderBy: timestamp,
            orderDirection: desc
        ) {
          id
          block
          timestamp
          vault
          pricePerShare
        }
    }`,
  });
  // extract the price data
  const priceData = response.data.data.vaultPricePerShares[0];
  const price = Number(
    ethers.utils.formatUnits(priceData.pricePerShare, decimals)
  );
  return {
    [`${network}:${vaultAddress}`]: {
      decimals,
      symbol,
      price,
    },
  };
};
