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
    list: {
      inputs: [],
      name: 'list',
      outputs: [{ internalType: 'bytes32[]', name: '', type: 'bytes32[]' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const MCD_VAT = {
  address: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
  abis: {
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

MCD_POT = {
  address: '0x197e90f9fad81970ba7976f33cbd77088e5d7cf7',
  abis: {
    Pie: {
      constant: true,
      inputs: [],
      name: 'Pie',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    dsr: {
      constant: true,
      inputs: [],
      name: 'dsr',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    chi: {
      constant: true,
      inputs: [],
      name: 'chi',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  },
};

async function dsr() {
  const [Pie, chi, dsr] = await Promise.all(
    ['Pie', 'chi', 'dsr'].map(
      async (name) =>
        (
          await sdk.api.abi.call({
            target: MCD_POT.address,
            abi: MCD_POT.abis[name],
          })
        ).output
    )
  );
  const tvlUsd = BigNumber(Pie).times(chi).div(1e18).div(RAY); // check against https://makerburn.com/#/
  const apy =
    (BigNumber(dsr).div(RAY).toNumber() ** (60 * 60 * 24 * 365) - 1) * 100;

  return {
    pool: MCD_POT.address,
    project: 'makerdao',
    symbol: 'DAI',
    chain: 'ethereum',
    poolMeta: 'DSR',
    apy,
    tvlUsd: tvlUsd.toNumber(),
  };
}

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
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
  const dsrPool = dsr();
  const ilkIds = (
    await sdk.api.abi.call({
      target: ILK_REGISTRY.address,
      abi: ILK_REGISTRY.abis.list,
      chain: 'ethereum',
    })
  ).output;
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

  const ilks = (
    await sdk.api.abi.multiCall({
      calls: ilkIds.map((ilkId) => ({
        target: MCD_VAT.address,
        params: [ilkId],
      })),
      abi: MCD_VAT.abis.ilks,
      requery: true,
    })
  ).output.map((x) => x.output);
  const spots = (
    await sdk.api.abi.multiCall({
      calls: ilkIds.map((ilkId) => ({
        target: MCD_SPOT.address,
        params: [ilkId],
      })),
      abi: MCD_SPOT.abis.ilks,
      requery: true,
    })
  ).output.map((x) => x.output);
  const rate = ilksDatas.map((e) => e.duty);
  const tokenBalances = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: gems.map((address, index) => {
        return { target: address, params: [joins[index]] };
      }),
      chain: 'ethereum',
      requery: false,
      permitFailure: true,
    })
  ).output.map((e) => e.output);

  const mapPrice = gems.map((address) => `ethereum:${address}`);
  const prices = await getPrices(mapPrice);
  const blackList = [
    '0x3435353434383264343130303030303030303030303030303030303030303030',
    '0x3432343135343264343130303030303030303030303030303030303030303030',
    '0x3078353734323534343332643433303030303030303030303030303030303030',
  ];

  return joins
    .map((_, index) => {
      const normalizRate = new BigNumber(rate[index]).dividedBy(RAY);
      BigNumber.config({ POW_PRECISION: 100 });
      const stabilityFee = normalizRate.pow(SECONDS_PER_YEAR).minus(1);
      const art = new BigNumber(ilks[index].Art).div(1e18);
      const debtScalingFactor = new BigNumber(ilks[index].rate).div(1e27);
      const totalBorrowUsd = debtScalingFactor.multipliedBy(art);
      const debtCeilingUsd = new BigNumber(ilks[index].line).div(1e45);
      const tvlUsd = new BigNumber(tokenBalances[index])
        .dividedBy(new BigNumber(10).pow(decimals[index]))
        .multipliedBy(prices[gems[index].toLowerCase()])
        .toNumber();
      const spot = spots[index];
      const liquidationRatio = new BigNumber(spot.mat).div(1e27);
      return {
        pool: joins[index],
        project: 'makerdao',
        symbol: symbols[index],
        chain: 'ethereum',
        poolMeta: !blackList.includes(ilkIds[index])
          ? ethers.utils.parseBytes32String(ilkIds[index])
          : '',
        apy: 0,
        tvlUsd: tvlUsd,
        // borrow fields
        apyBaseBorrow: stabilityFee.toNumber() * 100,
        totalSupplyUsd: tvlUsd,
        totalBorrowUsd: totalBorrowUsd.toNumber(),
        debtCeilingUsd: debtCeilingUsd.toNumber(),
        mintedCoin: 'DAI',
        ltv: 1 / Number(liquidationRatio.toNumber()),
      };
    })
    .concat([await dsrPool])
    .filter((e) => e.tvlUsd !== NaN)
    .filter((e) => e.tvlUsd !== 0)
    .filter((e) => e.tvlUsd);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://makerdao.com/',
};
