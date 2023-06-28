const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const VESSEL_MANAGER_ADDRESS = '0xdB5DAcB1DFbe16326C3656a88017f0cB4ece0977';
const ADMIN_CONTRACT_ADDRESS = '0xf7Cc67326F9A1D057c1e4b110eF6c680B13a1f53';
const GRAI_ADDRESS = '0x15f74458aE0bFdAA1a96CA1aa779D715Cc1Eefe4';
// const URL = 'https://api.instadapp.io/defi/mainnet/liquity/trove-types';

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
      target: VESSEL_MANAGER_ADDRESS,
      abi: ABIS.getEntireSystemColl,
      chain: 'ethereum',
    })
  ).output;

  const mcr = (
    await sdk.api.abi.call({
      target: VESSEL_MANAGER_ADDRESS,
      abi: ABIS.getMCR,
      chain: 'ethereum',
    })
  ).output;

  const troveType = (await superagent.get(URL)).body;

  const graiTotalSupply = (
    await sdk.api.abi.call({
      target: GRAI_ADDRESS,
      abi: 'erc20:totalSupply',
      chain: 'ethereum',
    })
  ).output;

  const key = `ethereum:${GRAI_ADDRESS}`.toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins;

  const totalSupplyUsd = (Number(graiTotalSupply) / 1e18) * prices[key].price;

  return [
    {
      pool: VESSEL_MANAGER_ADDRESS,
      project: 'gravita-protocol',
      symbol: 'WETH',
      chain: 'ethereum',
      apy: 0,
      tvlUsd: (Number(troveEthTvl) / 1e18) * Number(troveType.price),
      apyBaseBorrow: Number(troveType.borrowFee) * 100,
      totalSupplyUsd: (Number(troveEthTvl) / 1e18) * Number(troveType.price),
      totalBorrowUsd: totalSupplyUsd,
      ltv: 1 / (mcr / 1e18),
      mintedCoin: 'GRAI',
      underlyingTokens: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.gravitaprotocol.com/',
};
