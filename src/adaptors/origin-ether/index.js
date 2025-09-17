const axios = require('axios');
const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const { capitalizeFirstLetter } = require('../utils');

const ETHEREUM_WETH_TOKEN = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const ETHEREUM_OETH_TOKEN = '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3';
const BASE_WETH_TOKEN = '0x4200000000000000000000000000000000000006';
const BASE_SUPER_OETH_TOKEN = '0xDBFeFD2e8460a6Ee4955A68582F85708BAEA60A3';
const PLUME_WETH_TOKEN = '0xca59cA09E5602fAe8B629DeE83FfA819741f14be';
const PLUME_SUPER_OETH_TOKEN = '0xFCbe50DbE43bF7E5C88C6F6Fb9ef432D4165406E';

const oethVaultAddress = '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab';
const superOETHbVaultAddress = '0x98a0CbeF61bD2D21435f433bE4CD42B56B38CC93';
const superOETHpVaultAddress = '0xc8c8F8bEA5631A8AF26440AF32a55002138cB76a';

const graphUrl = 'https://origin.squids.live/origin-squid/graphql';

const vaultABI = {
  inputs: [],
  name: 'totalValue',
  outputs: [{ internalType: 'uint256', name: 'value', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const fetchPoolData = async ({
  chain,
  vaultAddress,
  token,
  symbol,
  project,
  underlyingToken,
  chainId,
}) => {
  const query = gql`
    query OTokenApy($chainId: Int!, $token: String!) {
      oTokenApies(
        limit: 1
        orderBy: timestamp_DESC
        where: { chainId_eq: $chainId, otoken_containsInsensitive: $token }
      ) {
        apy7DayAvg
      }
    }
  `;

  const variables = {
    token,
    chainId,
  };

  const apyData = await request(graphUrl, query, variables);
  const apy = apyData.oTokenApies[0]?.apy7DayAvg * 100;

  const totalValueEth = (
    await sdk.api.abi.call({
      chain,
      target: vaultAddress,
      abi: vaultABI,
    })
  ).output;

  const ethPriceKey = `ethereum:${ETHEREUM_WETH_TOKEN}`;
  const ethPriceRes = await axios.get(
    `https://coins.llama.fi/prices/current/${ethPriceKey}`
  );
  const ethPrice = ethPriceRes.data.coins[ethPriceKey].price;

  const tvlUsd = (totalValueEth / 1e18) * ethPrice;

  return {
    pool: token,
    chain: capitalizeFirstLetter(chain),
    project,
    symbol,
    tvlUsd,
    apy,
    underlyingTokens: [underlyingToken],
  };
};

const apy = async () => {
  const pools = await Promise.allSettled([
    fetchPoolData({
      chain: 'ethereum',
      chainId: 1,
      vaultAddress: oethVaultAddress,
      token: ETHEREUM_OETH_TOKEN,
      symbol: 'OETH',
      project: 'origin-ether',
      underlyingToken: ETHEREUM_WETH_TOKEN,
    }),
    fetchPoolData({
      chain: 'base',
      chainId: 8453,
      vaultAddress: superOETHbVaultAddress,
      token: BASE_SUPER_OETH_TOKEN,
      symbol: 'superOETHb',
      project: 'origin-ether',
      underlyingToken: BASE_WETH_TOKEN,
    }),
    fetchPoolData({
      chain: 'plume_mainnet',
      chainId: 98866,
      vaultAddress: superOETHpVaultAddress,
      token: PLUME_SUPER_OETH_TOKEN,
      symbol: 'superOETHp',
      project: 'origin-ether',
      underlyingToken: PLUME_WETH_TOKEN,
    }),
  ]);
  return pools.filter((i) => i.status === 'fulfilled').map((i) => i.value);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://originprotocol.com',
};
