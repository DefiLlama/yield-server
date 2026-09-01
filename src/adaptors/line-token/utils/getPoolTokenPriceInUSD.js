const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const { LINE_CONTRACT_ADDRESS, CHAIN } = require('../config');

const LineAbi = require('../abi/lineAbi');
const equilibrePairAbi = require('../abi/equilibrePairAbi');
const { getData } = require('../../utils');
const fetchPriceFromCoingecko = require('./fetchPriceFromCoingecko');
const getDecimals = require('./getDecimals');

module.exports = async function getPoolTokenPriceInUSD(
  tokenAddress,
  lineTokenPriceInUSD
) {
  const tokens = await sdk.api.abi
    .call({
      target: tokenAddress,
      abi: equilibrePairAbi.find((m) => m.name === 'tokens'),
      chain: CHAIN,
    })
    .then((res) => res.output)
    .catch(() => false);

  if (tokens) {
    // it's a equilibre pool
    const totalSupplyGetter = sdk.api.abi
      .call({
        target: tokenAddress,
        abi: equilibrePairAbi.find((m) => m.name === 'totalSupply'),
        chain: CHAIN,
      })
      .then((data) => data.output);

    const reservesGetter = sdk.api.abi
      .call({
        target: tokenAddress,
        abi: equilibrePairAbi.find((m) => m.name === 'getReserves'),
        chain: CHAIN,
      })
      .then((data) => data.output);

    const [totalSupplyInPennies, reserves, poolTokenDecimals, token0Decimals] =
      await Promise.all([
        totalSupplyGetter,
        reservesGetter,
        getDecimals(tokenAddress),
        getDecimals(tokens[0]),
      ]);

    const price0 =
      tokens[0] !== LINE_CONTRACT_ADDRESS
        ? await fetchPriceFromCoingecko(tokens[0])
        : lineTokenPriceInUSD;
    let lpPriceInUSD = 0;

    if (totalSupplyInPennies) {
      const reserve0 = BigNumber(reserves[0])
        .dividedBy(10 ** token0Decimals)
        .toNumber();
      const totalSupply = BigNumber(totalSupplyInPennies)
        .dividedBy(10 ** poolTokenDecimals)
        .toNumber();

      lpPriceInUSD = (reserve0 * 2 * price0) / totalSupply;
    }

    return lpPriceInUSD;
  } else {
    // it's a token
    if (tokenAddress === LINE_CONTRACT_ADDRESS) {
      return String(lineTokenPriceInUSD);
    } else {
      return await fetchPriceFromCoingecko(tokenAddress)
        .then((price) => String(price))
        .catch(() => 0);
    }
  }
};
