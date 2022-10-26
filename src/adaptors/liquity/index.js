const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const TROVE_MANAGER_ADDRESS = '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2';
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
};
const main = async () => {
  const troveEthTvl = (
    await sdk.api.abi.call({
      target: TROVE_MANAGER_ADDRESS,
      abi: ABIS.getEntireSystemColl,
      chain: 'ethereum',
    })
  ).output;

  const troveType = (await superagent.get(URL)).body;
  return [
    {
      pool: TROVE_MANAGER_ADDRESS,
      project: 'liquity',
      symbol: 'WETH',
      chain: 'ethereum',
      apy: 0,
      tvlUsd: (Number(troveEthTvl) / 1e18) * Number(troveType.price),
      apyBaseBorrow: Number(troveType.borrowFee) * 100,
      totalSupplyUsd: 0,
      totalBorrowUsd: 0,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://defi.instadapp.io/liquity',
};
