const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const VESSEL_MANAGER_ADDRESS = '0xdB5DAcB1DFbe16326C3656a88017f0cB4ece0977';
const ADMIN_CONTRACT_ADDRESS = '0xf7Cc67326F9A1D057c1e4b110eF6c680B13a1f53';
const GRAI_ADDRESS = '0x15f74458aE0bFdAA1a96CA1aa779D715Cc1Eefe4';

const utils = require('../utils');
// const URL = 'https://api.instadapp.io/defi/mainnet/liquity/trove-types';

const ABIS = {
  getBorrowingFee: {
    inputs: [
      {
        internalType: 'address',
        name: '_collateral',
        type: 'address',
      },
    ],
    name: 'getBorrowingFee',
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
  getEntireSystemColl: {
    inputs: [
      {
        internalType: 'address',
        name: '_asset',
        type: 'address',
      },
    ],
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
  getEntireSystemDebt: {
    inputs: [
      {
        internalType: 'address',
        name: '_asset',
        type: 'address',
      },
    ],
    name: 'getEntireSystemDebt',
    outputs: [
      {
        internalType: 'uint256',
        name: 'entireSystemDebt',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getMCR: {
    inputs: [
      {
        internalType: 'address',
        name: '_collateral',
        type: 'address',
      },
    ],
    name: 'getMcr',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getMintCap: {
    inputs: [
      {
        internalType: 'address',
        name: '_collateral',
        type: 'address',
      },
    ],
    name: 'getMintCap',
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

  getValidCollateral: {
    inputs: [],
    name: 'getValidCollateral',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getSymbol: {
    inputs: [],
    name: 'symbol',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

const fetchAbiData = async (target, abi, params = []) => {
  const result = await sdk.api.abi.call({
    target,
    abi,
    params,
    chain: 'ethereum',
  });
  return result.output;
};

async function fetchPrice(token) {
  const key = `ethereum:${token}`.toLowerCase();
  const response = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins;
  return response[key]?.price;
}

const main = async () => {
  // Fetch an array of valid collaterals
  const collaterals = await fetchAbiData(
    ADMIN_CONTRACT_ADDRESS,
    ABIS.getValidCollateral
  );
  const graiPrice = await fetchPrice(GRAI_ADDRESS);
  // console.log('\nCollaterals:\n', collaterals);
  // console.log(`GRAI price -> ${graiPrice}`);

  const pools = await Promise.all(
    collaterals.map(async (collateral) => {
      const [
        symbol,
        assetPrice,
        vesselAssetTvl,
        mintedGrai,
        mintCap,
        mcr,
        borrowingFee,
      ] = await Promise.all([
        fetchAbiData(collateral, ABIS.getSymbol),
        fetchPrice(collateral),
        fetchAbiData(VESSEL_MANAGER_ADDRESS, ABIS.getEntireSystemColl, [
          collateral,
        ]),
        fetchAbiData(VESSEL_MANAGER_ADDRESS, ABIS.getEntireSystemDebt, [
          collateral,
        ]),
        fetchAbiData(ADMIN_CONTRACT_ADDRESS, ABIS.getMintCap, [collateral]),
        fetchAbiData(ADMIN_CONTRACT_ADDRESS, ABIS.getMCR, [collateral]),
        fetchAbiData(ADMIN_CONTRACT_ADDRESS, ABIS.getBorrowingFee, [
          collateral,
        ]),
      ]);

      /*   
      console.log(`ERC20.getSymbol() -> ${symbol}`);
      console.log(`${symbol} ERC20.price() -> ${assetPrice}`);
      console.log(`${symbol} VesselManager.getEntireSystemColl() -> ${vesselAssetTvl}`);
      console.log(`${symbol} VesselManager.getEntireSystemDebt() -> ${mintedGrai}`);
      console.log(`${symbol} AdminContract.getMCR() -> ${mcr}`);
      console.log(`${symbol} AdminContract.getBorrowingFee() -> ${borrowingFee}`); */

      const totalSupplyUsd = (vesselAssetTvl * assetPrice) / 1e18;
      const totalBorrowUsd = (mintedGrai * graiPrice) / 1e18;
      return {
        pool: `Gravita-${symbol}-Vault`,
        chain: 'ethereum',
        project: 'gravita-protocol',
        symbol: symbol,
        mintedCoin: 'GRAI',
        apy: 0,
        tvlUsd: totalSupplyUsd,
        underlyingTokens: [collateral],
        // optional lending protocol specific fields:
        apyBaseBorrow: borrowingFee / 1e16,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        debtCeilingUsd: (mintCap * graiPrice) / 1e18,
        ltv: 1 / (mcr / 1e18), // btw [0, 1]
      };
    })
  );

  return pools.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.gravitaprotocol.com/',
};
