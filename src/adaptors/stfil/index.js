const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiStakingPool = require('./abiStakingPool');

const stakingPool = '0xC8E4EF1148D11F8C557f677eE3C73901CD796Bf6';
const variableDebtTokenAddress = '0x0B24190702018C93E09A55F958D6485Ae31b62A1';
const sdkChain = 'filecoin';
const url = 'https://app.stfil.io/#/stake';

const getApy = async () => {
  const priceKey = `coingecko:filecoin`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const reserveData = (
    await sdk.api.abi.call({
      target: stakingPool,
      abi: abiStakingPool.find((m) => m.name === 'getReserveData'),
      chain: sdkChain,
    })
  ).output;
  const apyBase = reserveData.currentLiquidityRate / 1e25;
  const apyBaseBorrow = reserveData.currentVariableBorrowRate / 1e25;

  const totalBorrow = (
    await sdk.api.abi.call({
      target: variableDebtTokenAddress,
      abi: 'erc20:totalSupply',
      chain: sdkChain,
    })
  ).output;

  const decimal = (
    await sdk.api.abi.call({
      target: variableDebtTokenAddress,
      abi: 'erc20:decimals',
      chain: sdkChain,
    })
  ).output;

  const tvlUsd =
    (
      await sdk.api.eth.getBalance({
        target: stakingPool,
        decimals: 18,
        chain: sdkChain,
      })
    ).output * price;
  const totalBorrowUsd = (totalBorrow / 10 ** decimal) * price;
  const totalSupplyUsd = tvlUsd + totalBorrowUsd;

  return [
    {
      pool: `${stakingPool}-${sdkChain}`.toLowerCase(),
      symbol: 'stFIL',
      project: 'stfil',
      chain: sdkChain,
      tvlUsd,
      apyBase,
      url,
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
    },
  ];
};

module.exports = {
  apy: getApy,
};
