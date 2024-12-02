const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const TROVE_MANAGER_ADDRESS = '0x7A47cF15a1fCbAd09c66077d1D021430eed7AC65';
const USC_ADDRESS = '0xD42E078ceA2bE8D03cd9dFEcC1f0d28915Edea78';
const SUBGRAPH_URL = 'https://graph.cronoslabs.com/subgraphs/name/orby/orby';
const URL = 'https://api.crypto.com/pos/v1/public/get-conversion-rate';

const query = gql`
  query {
    global(id: "only") {
      currentSystemState {
        price
      }
    }
  }
`;

const req = {
  id: 1,
  method: 'ptivate/get-conversion-rate',
  params: {
    instrument_name: 'CDCETH',
  },
};

const ABIS = {
  getEntireSystemColl: {
    inputs: [],
    name: 'getEntireSystemColl',
    outputs: [
      {
        internalType: 'uint256',
        name: 'entireSystemColl',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getMCR: {
    inputs: [],
    name: 'MCR',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getBorrowFee: {
    inputs: [],
    name: 'getBorrowingRateWithDecay',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};
const main = async () => {
  const troveEthTvl = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getEntireSystemColl,
      chain: 'cronos',
    })
  ).output;

  const mcr = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getMCR,
      chain: 'cronos',
    })
  ).output;

  const uscTotalSupply = (
    await sdk.api.abi.call({
      target: USC_ADDRESS,
      abi: 'erc20:totalSupply',
      chain: 'cronos',
    })
  ).output;

  const borrowFee = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getBorrowFee,
      chain: 'cronos',
    })
  ).output;

  const key = `cronos:${USC_ADDRESS}`.toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins;

  const conversionRate = (await superagent.post(URL, req)).body.result
    .conversion_rate;

  const totalSupplyUsd = (Number(uscTotalSupply) / 1e18) * prices[key].price;

  const { global } = await request(SUBGRAPH_URL, query);

  return [
    {
      pool: TROVE_MANAGER_ADDRESS,
      project: 'orby-network',
      symbol: 'CDCETH',
      chain: 'cronos',
      apyBase: Number(conversionRate) - 1,
      apyReward: 0,
      tvlUsd:
        (Number(troveEthTvl) / 1e18) * Number(global.currentSystemState.price),
      apyBaseBorrow: Number(borrowFee / 1e18) * 100,
      apyRewardBorrow: 0,
      totalSupplyUsd:
        (Number(troveEthTvl) / 1e18) * Number(global.currentSystemState.price),
      totalBorrowUsd: totalSupplyUsd,
      ltv: 1 / (mcr / 1e18),
      mintedCoin: 'USC',
      underlyingTokens: ['0x7a7c9db510aB29A2FC362a4c34260BEcB5cE3446'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://orby.network/',
};
