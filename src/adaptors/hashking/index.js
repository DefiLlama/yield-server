const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const filHubPool = '0xfeB16A48dbBB0E637F68215b19B4DF5b12449676';
const sdkChain = 'filecoin';
const url = 'https://www.nodedao.com/';
const liquidStakingABI = require('./liquidStaking');

const getApyAbi = {
  inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
  name: 'getApy',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getApy = async () => {
  // <- Filecoin ->
  const filPriceKey = `coingecko:filecoin`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${filPriceKey}`)
  ).data.coins[filPriceKey]?.price;

  const tokenAddress = '0x84B038DB0fCde4fae528108603C7376695dc217F'; // Replace with your token address
  const getFilAPY = await sdk.api2.abi.call({
    target: filHubPool,
    abi: getApyAbi,
    params: [tokenAddress],
    chain: sdkChain,
  });

  console.log('getFilAPY: ', parseFloat(getFilAPY / 100));

  const owner = '0xe012f3957226894b1a2a44b3ef5070417a069dc2';
  const validators = await sdk.api2.abi.call({
    target: owner,
    abi: liquidStakingABI.find((m) => m.name === 'beneficiarys'),
    chain: sdkChain,
  });
  const bals = await sdk.api2.abi.multiCall({
    abi: {
      inputs: [],
      name: 'totalStakingFil',
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
    calls: validators,
    chain: sdkChain,
  });
  // parsing them to BigInt
  bigInts = bals.map(BigInt);

  // summing them up using reduce
  let sumBigInt = bigInts.reduce(
    (accumulator, current) => accumulator + current,
    BigInt(0)
  );
  const divisor = BigInt(10 ** 18);
  const filBigInt = Number(sumBigInt / divisor);
  const filTvl = filBigInt * price;
  const filecoinAPY = {
    pool: `${filHubPool}-${sdkChain}`.toLowerCase(), // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    chain: `${sdkChain}`, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    project: 'hashking', // protocol (using the slug again)
    symbol: 'FIL', // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    tvlUsd: filTvl, // number representing current USD TVL in pool
    apyBase: parseFloat(getFilAPY / 100), // APY from pool fees/supplying in %
    url,
  };

  return [filecoinAPY];
};

module.exports = {
  apy: getApy,
};
