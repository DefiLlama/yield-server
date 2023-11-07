const axios = require('axios');
const sdk = require('@defillama/sdk4');

const factoryAbi = require('./factoryAbi.json');
const troveManagerAbi = require('./troveManagerAbi.json');

const mkUsd = '0x4591DBfF62656E7859Afe5e45f6f47D3669fBB28'; // debt token
const prisma = '0xda47862a83dac0c112ba89c6abc2159b95afd71c'; // reward token
const factory = '0x70b66E20766b775B2E9cE5B718bbD285Af59b7E1';

const apy = async () => {
  const troveManagerCount = (
    await sdk.api.abi.call({
      target: factory,
      abi: factoryAbi.find((i) => i.name === 'troveManagerCount'),
    })
  ).output;

  const troveManagers = (
    await sdk.api.abi.multiCall({
      calls: Array.from({ length: troveManagerCount }, (_, index) => index).map(
        (i) => ({ target: factory, params: i })
      ),
      abi: factoryAbi.find((i) => i.name === 'troveManagers'),
    })
  ).output.map((i) => i.output);

  const collateralTokens = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'collateralToken'),
    })
  ).output.map((i) => i.output);

  const balanceOf = (
    await sdk.api.abi.multiCall({
      calls: collateralTokens.map((t, i) => ({
        target: t,
        params: troveManagers[i],
      })),
      abi: 'erc20:balanceOf',
    })
  ).output.map((i) => i.output);

  const MCR = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'MCR'),
    })
  ).output.map((i) => i.output);

  const systemDebt = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'getEntireSystemDebt'),
    })
  ).output.map((i) => i.output);

  const maxSystemDebt = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'maxSystemDebt'),
    })
  ).output.map((i) => i.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'rewardRate'),
    })
  ).output.map((i) => i.output);

  const interestRate = (
    await sdk.api.abi.multiCall({
      calls: troveManagers.map((i) => ({ target: i })),
      abi: troveManagerAbi.find((i) => i.name === 'interestRate'),
    })
  ).output.map((i) => i.output);

  const keys = [...collateralTokens, prisma]
    .map((i) => `ethereum:${i}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${keys}`)
  ).data.coins;

  return troveManagers.map((t, i) => {
    const priceDetails = prices[`ethereum:${collateralTokens[i]}`];
    const tvlUsd =
      (balanceOf[i] * priceDetails.price) / 10 ** priceDetails.decimals;

    const apyBaseBorrow = ((interestRate[i] * 86400 * 365) / 1e27) * 100;

    const apyRewardBorrow =
      (((rewardRate[i] / 1e18) *
        86400 *
        365 *
        prices[`ethereum:${prisma}`].price) /
        tvlUsd) *
      100;

    return {
      pool: t,
      chain: 'ethereum',
      project: 'prisma-finance',
      symbol: priceDetails.symbol,
      tvlUsd,
      apy: 0,
      mintedCoin: 'mkUsd',
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd: tvlUsd,
      totalBorrowUsd: systemDebt[i] / 1e18,
      debtCeilingUsd: maxSystemDebt[i] / 1e18,
      ltv: 1 / Number(MCR[i] / 1e18),
      url: `https://app.prismafinance.com/vaults/select/${t}`,
      rewardTokens: apyRewardBorrow > 0 ? [prisma] : [],
      underlyingTokens: [collateralTokens[i]],
    };
  });
};

module.exports = {
  apy,
};
