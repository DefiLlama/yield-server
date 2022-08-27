const sdk = require('@defillama/sdk');
const mEtherABI = require('./MEtherInterfaceFull.json');
const superagent = require('superagent');

const mEtherAddresses = {
  Glasses: '0xDdf26F3529CA4dC30f484b4F9d3A7ce0b7BD1562',
  Milady: '0x9EAA40e8084F3C54B6E69C0A2ECaCF38cBf9b780',
  Pudgy: '0x3bca3a1e6a573ca87cddf10eb49bb508a8188cb6',
};

const ETHAddr = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async (block) => {
  const thisFungibleMTokenABI = mEtherABI.find(
    (i) => i.name === 'thisFungibleMToken'
  );

  const mEtherIDCalls = Object.values(mEtherAddresses).map((mEtherAddr) => ({
    target: mEtherAddr,
  }));

  const mEtherIDs = await sdk.api.abi.multiCall({
    abi: thisFungibleMTokenABI,
    calls: mEtherIDCalls,
    block: block,
  });

  const totalSupplyABI = mEtherABI.find((i) => i.name === 'totalSupply');

  const totalSupplyCalls = Object.values(mEtherAddresses).map(
    (mEtherAddr, idx) => ({
      target: mEtherAddr,
      params: mEtherIDs.output[idx].output,
    })
  );

  const totalSupply = await sdk.api.abi.multiCall({
    abi: totalSupplyABI,
    calls: totalSupplyCalls,
    block: block,
  });

  const exchangeRateABI = mEtherABI.find(
    (i) => i.name === 'exchangeRateStored'
  );

  const exchangeRateCalls = Object.values(mEtherAddresses).map(
    (mEtherAddr, idx) => ({
      target: mEtherAddr,
      params: mEtherIDs.output[idx].output,
    })
  );

  const exchangeRate = await sdk.api.abi.multiCall({
    abi: exchangeRateABI,
    calls: exchangeRateCalls,
    block: block,
  });

  const supplyAPYABI = mEtherABI.find((i) => i.name === 'supplyRatePerBlock');

  const APYCalls = Object.values(mEtherAddresses).map((mEtherAddr, idx) => ({
    target: mEtherAddr,
    params: mEtherIDs.output[idx].output,
  }));

  const APY = await sdk.api.abi.multiCall({
    abi: supplyAPYABI,
    calls: APYCalls,
    block: block,
  });

  // pull token prices
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [`ethereum:${ETHAddr}`],
    })
  ).body.coins;

  const ETHPrice = Number(prices[`ethereum:${ETHAddr}`].price);

  return [
    {
      pool: mEtherAddresses.Glasses,
      chain: 'Ethereum',
      project: 'mmo-finance',
      symbol: `Glasses-mETH`,
      tvlUsd:
        (((Number(totalSupply.output[0].output) / 10 ** 18) *
          Number(exchangeRate.output[0].output)) /
          10 ** 18) *
        ETHPrice,
      apy: ((Number(APY.output[0].output) * 2102400) / 10 ** 18) * 100,
      underlyingTokens: [mEtherAddresses.Glasses],
    },
    {
      pool: mEtherAddresses.Milady,
      chain: 'Ethereum',
      project: 'mmo-finance',
      symbol: `Milady-mETH`,
      tvlUsd:
        (((Number(totalSupply.output[1].output) / 10 ** 18) *
          Number(exchangeRate.output[1].output)) /
          10 ** 18) *
        ETHPrice,
      apy: ((Number(APY.output[1].output) * 2102400) / 10 ** 18) * 100,
      underlyingTokens: [mEtherAddresses.Milady],
    },
    {
      pool: mEtherAddresses.Pudgy,
      chain: 'Ethereum',
      project: 'mmo-finance',
      symbol: `Pudgy-mETH`,
      tvlUsd:
        (((Number(totalSupply.output[2].output) / 10 ** 18) *
          Number(exchangeRate.output[2].output)) /
          10 ** 18) *
        ETHPrice,
      apy: ((Number(APY.output[2].output) * 2102400) / 10 ** 18) * 100,
      underlyingTokens: [mEtherAddresses.Pudgy],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://mmo.finance/supply',
};
