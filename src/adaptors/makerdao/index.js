const ethers = require('ethers');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const RAY_PRECISION = 27;
const RAY = new BigNumber(10).pow(RAY_PRECISION);

const MCD_JUG = {
  address: '0x19c0976f590D67707E62397C87829d896Dc0f1F1',
  abis: {
    ilks: {
      constant: true,
      inputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      name: 'ilks',
      outputs: [
        {
          internalType: 'uint256',
          name: 'duty',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'rho',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const CDP_MANAGER = {
  address: '0x5ef30b9986345249bc32d8928B7ee64DE9435E39',
  abis: {
    urns: {
      constant: true,
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'urns',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    ilks: {
      constant: true,
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'ilks',
      outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    owns: {
      constant: true,
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'owns',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    cdpi: {
      constant: true,
      inputs: [],
      name: 'cdpi',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  },
};
const ILK_REGISTRY = {
  address: '0x5a464C28D19848f44199D003BeF5ecc87d090F87',
  abis: {
    gem: {
      inputs: [{ internalType: 'bytes32', name: 'ilk', type: 'bytes32' }],
      name: 'gem',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    ilkData: {
      inputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      name: 'ilkData',
      outputs: [
        {
          internalType: 'uint96',
          name: 'pos',
          type: 'uint96',
        },
        {
          internalType: 'address',
          name: 'join',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'gem',
          type: 'address',
        },
        {
          internalType: 'uint8',
          name: 'dec',
          type: 'uint8',
        },
        {
          internalType: 'uint96',
          name: 'class',
          type: 'uint96',
        },
        {
          internalType: 'address',
          name: 'pip',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'xlip',
          type: 'address',
        },
        {
          internalType: 'string',
          name: 'name',
          type: 'string',
        },
        {
          internalType: 'string',
          name: 'symbol',
          type: 'string',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const MCD_VAT = {
  address: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
  abis: {
    urns: {
      constant: true,
      inputs: [
        { internalType: 'bytes32', name: '', type: 'bytes32' },
        { internalType: 'address', name: '', type: 'address' },
      ],
      name: 'urns',
      outputs: [
        { internalType: 'uint256', name: 'ink', type: 'uint256' },
        { internalType: 'uint256', name: 'art', type: 'uint256' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    ilks: {
      constant: true,
      inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      name: 'ilks',
      outputs: [
        { internalType: 'uint256', name: 'Art', type: 'uint256' },
        { internalType: 'uint256', name: 'rate', type: 'uint256' },
        { internalType: 'uint256', name: 'spot', type: 'uint256' },
        { internalType: 'uint256', name: 'line', type: 'uint256' },
        { internalType: 'uint256', name: 'dust', type: 'uint256' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const MCD_SPOT = {
  address: '0x65C79fcB50Ca1594B025960e539eD7A9a6D434A3',
  abis: {
    ilks: {
      constant: true,
      inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      name: 'ilks',
      outputs: [
        { internalType: 'contract PipLike', name: 'pip', type: 'address' },
        { internalType: 'uint256', name: 'mat', type: 'uint256' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const ERC20 = {
  abis: {
    decimals: {
      inputs: [],
      name: 'decimals',
      outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};
function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const main = async () => {
  const cdpi = (
    await sdk.api.abi.call({
      target: CDP_MANAGER.address,
      abi: CDP_MANAGER.abis.cdpi,
    })
  ).output;
  const cdps = Array.from(Array(Number(cdpi)).keys()).map((x) => x + 1); // starts from 1

  const ilkIdsCall = (
    await sdk.api.abi.multiCall({
      calls: cdps.map((i) => ({ target: CDP_MANAGER.address, params: [i] })),
      abi: CDP_MANAGER.abis.ilks,
      requery: true,
    })
  ).output.map((x) => x.output);
  const ilkIds = ilkIdsCall.filter(onlyUnique);
  const ilkDatas = (
    await sdk.api.abi.multiCall({
      calls: ilkIds.map((ilkId) => ({
        target: ILK_REGISTRY.address,
        params: [ilkId],
      })),
      abi: ILK_REGISTRY.abis.ilkData,
      requery: true,
    })
  ).output.map((x) => x.output);
  const joins = ilkDatas.map((e) => e['1']);
  const gems = ilkDatas.map((e) => e.gem);
  const symbols = ilkDatas.map((e) => e.symbol);
  const decimals = ilkDatas.map((e) => e['3']);

  const ilksDatas = (
    await sdk.api.abi.multiCall({
      calls: ilkIds.map((ilkId) => ({
        target: MCD_JUG.address,
        params: [ilkId],
      })),
      abi: MCD_JUG.abis.ilks,
      requery: true,
    })
  ).output.map((x) => x.output);
  const rate = ilksDatas.map((e) => e.duty);

  const tokenBalances = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: gems.map((address, index) => {
        return { target: address, params: joins[index] };
      }),
      chain: 'ethereum',
    })
  ).output.map((e) => e.output);

  const mapPrice = gems.map((address) => `ethereum:${address}`);
  const prices = await getPrices(mapPrice);
  return ilkIds
    .map((ilk, index) => {
      return {
        pool: joins[index],
        project: 'makerdao',
        symbol: symbols[index],
        chain: 'ethereum',
        apy: 0,
        tvlUsd: new BigNumber(tokenBalances[index])
          .dividedBy(new BigNumber(10).pow(decimals[index]))
          .multipliedBy(prices[gems[index].toLowerCase()])
          .toNumber(),
        // borrow fields
        apyBaseBorrow: new BigNumber(rate[index])
          .dividedBy(RAY)
          .pow(SECONDS_PER_YEAR)
          .minus(1)
          .toNumber(),
        totalSupplyUsd: 0,
        totalBorrowUsd: 0,
      };
    })
    .filter((e) => e.tvlUsd !== NaN)
    .filter((e) => e.tvlUsd !== 0)
    .filter((e) => e.tvlUsd);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://makerdao.com/',
};
