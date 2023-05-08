// Copied from aave v3
const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const ethV3Pools = async () => {
  const AaveProtocolDataProviderV3Mainnet =
    '0xFc21d6d146E6086B8359705C8b28512a983db0cb';
  const reserveTokens = (
    await sdk.api.abi.call({
      target: AaveProtocolDataProviderV3Mainnet,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: 'ethereum',
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: AaveProtocolDataProviderV3Mainnet,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: 'ethereum',
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: AaveProtocolDataProviderV3Mainnet,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: AaveProtocolDataProviderV3Mainnet,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const totalSupplyEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalancesEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimalsEthereum = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `ethereum:${t.tokenAddress}`)
    .join(',');
  const pricesEthereum = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  return reserveTokens.map((pool, i) => {
    const p = poolsReserveData[i];
    const price = pricesEthereum[`ethereum:${pool.tokenAddress}`]?.price;

    const supply = totalSupplyEthereum[i];
    const totalSupplyUsd =
      (supply / 10 ** underlyingDecimalsEthereum[i]) * price;

    const currentSupply = underlyingBalancesEthereum[i];
    const tvlUsd =
      (currentSupply / 10 ** underlyingDecimalsEthereum[i]) * price;

    return {
      pool: `${aTokens[i].tokenAddress}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'spark',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd: totalSupplyUsd - tvlUsd,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      ltv: poolsReservesConfigurationData[i].ltv / 10000,
      borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
    };
  });
};

const apy = async () => {
  const ethPools = await ethV3Pools();

  const ilk = (
    await sdk.api.abi.call({
        target: "0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B",
        params: ["0x4449524543542d535041524b2d44414900000000000000000000000000000000"],
        abi: {
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
    })
  ).output;
  const daiPool = ethPools.find(p=>p.symbol==="DAI")
  daiPool.totalSupplyUsd = Number(ilk.line)/1e45
  daiPool.tvlUsd = daiPool.totalSupplyUsd - daiPool.totalBorrowUsd

  return ethPools;
};

module.exports = {
  timetravel: false,
  apy: apy,
};
