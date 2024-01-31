const { multiCall, call } = require('../../helper/starknet');
const { marketAbi, erc20Abi, irmAbi, zTokenAbi } = require('./abi');
const axios = require('axios');
const BN = require('bn.js');
const { default: BigNumber } = require('bignumber.js');

const SCALE = BigNumber('1000000000000000000000000000');
const e = 2.7182818284590452353602874713527;
const market =
  '0x4c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05';

const assets = [
  {
    name: 'DAI',
    address:
      '0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
    decimals: 18,
  },
  {
    name: 'USDC',
    address:
      '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    decimals: 6,
  },
  {
    name: 'USDT',
    address:
      '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    decimals: 6,
  },
  {
    name: 'WBTC',
    address:
      '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    decimals: 8,
  },
  {
    name: 'ETH',
    address:
      '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    decimals: 18,
  },
  {
    name: 'wstETH',
    address:
      '0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2',
    decimals: 18,
  },
];

const getTokenPrice = async (token) => {
  const networkTokenPair = `starknet:${token}`;
  return (
    await axios.get(`https://coins.llama.fi/prices/current/${networkTokenPair}`)
  ).data.coins[networkTokenPair].price;
};

const apy = async () => {
  const promises = assets.map(async ({ name, address, decimals }) => {
    const [priceUsd, marketTokenBalanceBn, totalDebtBn, reserveData] =
      await Promise.all([
        getTokenPrice(address),
        call({
          abi: erc20Abi.balanceOf,
          target: address,
          params: [market],
        }),
        call({
          abi: marketAbi.get_total_debt_for_token,
          target: market,
          params: [address],
        }),
        call({
          abi: marketAbi.get_reserve_data,
          target: market,
          params: [address],
          allAbi: [marketAbi.MarketReserveData],
        }),
      ]);

    const interestRates = await call({
      abi: irmAbi.get_interest_rates,
      target: `0x${reserveData.interest_rate_model.toString(16)}`,
      params: [marketTokenBalanceBn, totalDebtBn],
      allAbi: [irmAbi.ModelRates],
    });

    const reserveFactor = BigNumber(reserveData.reserve_factor.toString());
    const lendingApr = BigNumber(interestRates.lending_rate.toString())
      .multipliedBy(SCALE.minus(reserveFactor))
      .div(SCALE)
      .div(SCALE);
    const borrowApr = BigNumber(interestRates.borrowing_rate.toString()).div(
      SCALE,
    );

    // In percent
    const lendingApy = (Math.pow(e, lendingApr.toNumber()) - 1) * 100;
    const borrowApy = (Math.pow(e, borrowApr.toNumber()) - 1) * 100;

    const totalDebt = BigNumber(totalDebtBn.toString()).div(
      BigNumber(`1e${decimals}`),
    );
    const totalDebtUsd = totalDebt.times(priceUsd);
    const marketTokenBalance = BigNumber(marketTokenBalanceBn.toString()).div(
      BigNumber(`1e${decimals}`),
    );
    const marketTokenBalanceUsd = marketTokenBalance.times(priceUsd);

    const zTokenAddress = `0x${reserveData.z_token_address.toString(16)}`;

    return {
      pool: `${zTokenAddress}-starknet`.toLowerCase(),
      chain: 'Starknet',
      project: `zklend`,
      symbol: name,
      tvlUsd: marketTokenBalanceUsd.toNumber(),
      apyBase: lendingApy,
      apyBaseBorrow: borrowApy,
      underlyingTokens: [address],
      totalSupplyUsd: marketTokenBalanceUsd.plus(totalDebtUsd).toNumber(),
      totalBorrowUsd: totalDebtUsd.toNumber(),
      url: `https://app.zklend.com/asset/${name}`,
    };
  });

  return Promise.all(promises);
};

module.exports = {
  apy,
  url: 'https://app.zklend.com/markets',
};
