const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { collateralList, getIlks } = require('./config');

// under src/adaptors, run `npm run test --adapter=lisusd` to test the adaptor
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const RAY = new BigNumber(10).pow(27);

const INTERACTION = {
  address: '0xB68443Ee3e828baD1526b3e0Bdf2Dfc6b1975ec4',
  abis: {
    depositTVL: {
      inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
      name: 'depositTVL',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    getNextDuty: {
      inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
      name: 'getNextDuty',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    collateralTVL: {
      inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
      name: 'collateralTVL',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    collateralRate: {
      inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
      name: 'collateralRate',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const DYNAMIC_DUTY_CALCULATOR = {
  address: '0x873339A8214657175D9B128dDd57A2f2c23256FA',
  abis: {
    maxDuty: {
      inputs: [],
      name: 'maxDuty',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    minDuty: {
      inputs: [],
      name: 'minDuty',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const JUG = {
  address: '0x787BdEaa29A253e40feB35026c3d05C18CbCA7B3',
  abis: {
    ilks: {
      inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      name: 'ilks',
      outputs: [
        { internalType: 'uint256', name: 'duty', type: 'uint256' },
        { internalType: 'uint256', name: 'rho', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const VAT = {
  address: '0x33A34eAB3ee892D40420507B820347b1cA2201c4',
  abis: {
    ilks: {
      inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
      name: 'ilks',
      outputs: [
        { internalType: 'uint256', name: 'Art', type: 'uint256' },
        { internalType: 'uint256', name: 'rate', type: 'uint256' },
        { internalType: 'uint256', name: 'spot', type: 'uint256' },
        { internalType: 'uint256', name: 'line', type: 'uint256' },
        { internalType: 'uint256', name: 'dust', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const calcApr = async (collateralAddress) => {
  try {
    // Get max and min duty rates
    const [maxDutyResponse, minDutyResponse] = await Promise.all([
      sdk.api.abi.call({
        target: DYNAMIC_DUTY_CALCULATOR.address,
        abi: DYNAMIC_DUTY_CALCULATOR.abis.maxDuty,
        chain: 'bsc',
      }),
      sdk.api.abi.call({
        target: DYNAMIC_DUTY_CALCULATOR.address,
        abi: DYNAMIC_DUTY_CALCULATOR.abis.minDuty,
        chain: 'bsc',
      }),
    ]);

    // Get current duty rate using ilk name
    const ilkHash = getIlks(collateralAddress);
    const jugResponse = await sdk.api.abi.call({
      target: JUG.address,
      params: [ilkHash],
      abi: JUG.abis.ilks,
      chain: 'bsc',
    });

    let _duty = Number(jugResponse.output[0].toString());
    const _maxDuty = Number(maxDutyResponse.output.toString());
    const _minDuty = Number(minDutyResponse.output.toString());

    console.log('Raw values:');
    console.log('duty:', _duty);
    console.log('maxDuty:', _maxDuty);
    console.log('minDuty:', _minDuty);

    // Apply min/max constraints
    if (_maxDuty != null && _duty >= _maxDuty) {
      _duty = _maxDuty;
    }
    if (_minDuty != null && _duty <= _minDuty) {
      _duty = _minDuty;
    }

    // Calculate APR
    const result = (_duty / 1e27) ** (365 * 24 * 3600) - 1;

    console.log('Final APR:', result * 100);

    return result * 100; // Convert to percentage
  } catch (error) {
    console.error('Error calculating APR:', error);
    return 0;
  }
};

const getApy = async () => {
  try {
    // Get token prices
    // const tokenAddresses = collateralList.map(
    //   (c) => `bsc:${c.originAddress || c.address.toLowerCase()}`
    // );
    // console.log('Fetching prices for tokens:', tokenAddresses);

    // const pricesResponse = await superagent.get(
    //   `https://coins.llama.fi/prices/current/${tokenAddresses.join(',')}`
    // );
    // const prices = pricesResponse.body.coins;
    // console.log('Got prices:', prices);

    const poolData = await Promise.all(
      collateralList.map(async (collateral) => {
        try {
          console.log(`Processing collateral: ${collateral.symbol}`);

          // Get TVL
          const tvlResponse = await sdk.api.abi.call({
            target: INTERACTION.address,
            params: [collateral.address],
            abi: INTERACTION.abis.depositTVL,
            chain: 'bsc',
          });
          const tvl = tvlResponse.output;
          console.log(`TVL for ${collateral.symbol}:`, tvl);

          // Get APR rates - pass entire collateral object
          const aprRates = await calcApr(collateral);
          console.log(`APR rates for ${collateral.symbol}:`, aprRates);

          //   const priceKey = `bsc:${
          //     collateral.originAddress || collateral.address.toLowerCase()
          //   }`;
          //   if (!prices[priceKey]) {
          //     console.log(`No price found for ${priceKey}`);
          //     return null;
          //   }

          //   const tvlUsd = (Number(tvl) / 1e18) * prices[priceKey].price;

          // Get collateral rate and debt
          const [collateralRateRes, debtRes] = await Promise.all([
            sdk.api.abi.call({
              target: INTERACTION.address,
              params: [collateral.address],
              abi: INTERACTION.abis.collateralRate,
              chain: 'bsc',
            }),
            sdk.api.abi.call({
              target: INTERACTION.address,
              params: [collateral.address],
              abi: INTERACTION.abis.collateralTVL,
              chain: 'bsc',
            }),
          ]);

          const collateralRate = Number(collateralRateRes.output) / 1e18;
          const debt = Number(debtRes.output) / 1e18;

          // Get VAT ilks data for debt ceiling
          const ilkHash = getIlks(collateral);
          const vatIlksRes = await sdk.api.abi.call({
            target: VAT.address,
            params: [ilkHash],
            abi: VAT.abis.ilks,
            chain: 'bsc',
          });

          const debtCeiling = Number(vatIlksRes.output.line) / 1e45; // line is in RAD (45 decimals)
          return {
            pool: `${collateral.address}-bsc`.toLowerCase(),
            chain: 'bsc',
            project: 'lista-cdp',
            symbol: collateral.symbol,
            apy: 0,
            tvlUsd: Number(tvl) / 1e18,

            totalSupplyUsd: Number(tvl) / 1e18,
            totalBorrowUsd: debt,
            debtCeilingUsd: debtCeiling,
            mintedCoin: 'lisUSD',
            ltv: collateralRate,
            apyBaseBorrow: aprRates || 0,
          };
        } catch (error) {
          console.error(`Error processing ${collateral.symbol}:`, error);
          return null;
        }
      })
    );

    return poolData.filter(Boolean);
  } catch (error) {
    console.error('Error in getApy:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://lista.org/',
};
