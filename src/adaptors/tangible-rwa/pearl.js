const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

const pearlPair = require('./abis/Pair.json');
const pearlPairFactory = require('./abis/PairFactory.json');

const CHAIN_NAME = 'polygon';

exports.getPrice = async (pair, quoteToken) => {
  let { _reserve0, _reserve1 } = await sdk.api.abi
    .call({
      target: pair,
      abi: pearlPair.abi.find((m) => m.name === 'getReserves'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  let [token0, token1] = await sdk.api.abi
    .call({
      target: pair,
      abi: pearlPair.abi.find((m) => m.name === 'tokens'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const stable = await sdk.api.abi
    .call({
      target: pair,
      abi: pearlPair.abi.find((m) => m.name === 'stable'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  if (quoteToken !== token0) {
    [_reserve0, _reserve1] = [_reserve1, _reserve0];
    [token0, token1] = [token1, token0];
  }

  const [reserve0, reserve1] = [_reserve0, _reserve1].map(
    (n) => new BigNumber(n)
  );

  const [decimals0, decimals1] = await sdk.api.abi
    .multiCall({
      calls: [
        {
          target: token0,
        },
        {
          target: token1,
        },
      ],
      abi: 'erc20:decimals',
      chain: CHAIN_NAME,
    })
    .then((result) => result.output.map((o) => o.output));

  const factor0 = new BigNumber(10).pow(decimals0);
  const factor1 = new BigNumber(10).pow(decimals1);

  if (stable) {
    // Formula: (3 * reserve1 ** 2 * reserve0 + reserve0 ** 3) / (3 * reserve0 ** 2 * reserve1 + reserve1 ** 3)
    let numerator = ethers.BigNumber.from(3)
      .mul(reserve1.mul(reserve1).mul(reserve0))
      .add(reserve0.mul(reserve0).mul(reserve0))
      .mul(factor1.pow(3));
    let denominator = ethers.BigNumber.from(3)
      .mul(reserve0.mul(reserve0).mul(reserve1))
      .add(reserve1.mul(reserve1).mul(reserve1))
      .mul(factor0.pow(3));

    return numerator.div(denominator);
  } else {
    // Formula: reserve0 / reserve1
    return reserve0
      .multipliedBy(factor1)
      .dividedBy(reserve1.multipliedBy(factor0));
  }
};

exports.getPairs = async (pairs) => {
  return await sdk.api.abi
    .multiCall({
      calls: pairs.map((p) => {
        return {
          target: pearlPairFactory.address,
          params: p,
        };
      }),
      abi: pearlPairFactory.abi.find((m) => m.name === 'getPair'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output.map((o) => o.output));
};
