const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const TROVE_MANAGER_ADDRESS = '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2';
const LUSD_ADDRESS = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const URL = 'https://api.instadapp.io/defi/mainnet/liquity/trove-types';

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
};
const main = async () => {
  const troveEthTvl = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getEntireSystemColl,
      chain: 'ethereum',
    })
  ).output;

  const mcr = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getMCR,
      chain: 'ethereum',
    })
  ).output;

  const troveType = (await superagent.get(URL)).body;

  const lusdTotalSupply = (
    await sdk.api.abi.call({
      target: LUSD_ADDRESS,
      abi: 'erc20:totalSupply',
      chain: 'ethereum',
    })
  ).output;

  const key = `ethereum:${LUSD_ADDRESS}`.toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins;

  const totalSupplyUsd = (Number(lusdTotalSupply) / 1e18) * prices[key].price;

  return [
    {
      pool: TROVE_MANAGER_ADDRESS,
      project: 'liquity',
      symbol: 'WETH',
      chain: 'ethereum',
      apy: 0,
      tvlUsd: (Number(troveEthTvl) / 1e18) * Number(troveType.price),
      apyBaseBorrow: Number(troveType.borrowFee) * 100,
      totalSupplyUsd: (Number(troveEthTvl) / 1e18) * Number(troveType.price),
      totalBorrowUsd: totalSupplyUsd,
      ltv: 1 / (mcr / 1e18),
      mintedCoin: 'LUSD',
      underlyingTokens: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.liquity.org/',
};
