const axios = require('axios');
const sdk = require('@defillama/sdk');

const abiFactory = require('./abiFactory.json');
const abiControllers = require('./abiControllers.json');
const abiPolicies = require('./abiPolicies.json');

const factory = '0xC9332fdCB1C491Dcc683bAe86Fe3cb70360738BC';
const crvUsd = '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E';

const apy = async () => {
  const nCollaterals = (
    await sdk.api.abi.call({
      target: factory,
      abi: abiFactory.find((m) => m.name === 'n_collaterals'),
    })
  ).output;

  const controllers = (
    await sdk.api.abi.multiCall({
      calls: [...Array.from({ length: nCollaterals }).keys()].map((i) => ({
        target: factory,
        params: i,
      })),
      abi: abiFactory.find((m) => m.name === 'controllers'),
    })
  ).output.map((o) => o.output);

  const amms = (
    await sdk.api.abi.multiCall({
      calls: [...Array.from({ length: nCollaterals }).keys()].map((i) => ({
        target: factory,
        params: i,
      })),
      abi: abiFactory.find((m) => m.name === 'amms'),
    })
  ).output.map((o) => o.output);

  const collateralTokens = (
    await sdk.api.abi.multiCall({
      calls: controllers.map((i) => ({
        target: i,
      })),
      abi: abiControllers.find((m) => m.name === 'collateral_token'),
    })
  ).output.map((o) => o.output);

  const monetaryPolicies = (
    await sdk.api.abi.multiCall({
      calls: controllers.map((i) => ({
        target: i,
      })),
      abi: abiControllers.find((m) => m.name === 'monetary_policy'),
    })
  ).output.map((o) => o.output);

  const rates = (
    await sdk.api.abi.multiCall({
      calls: monetaryPolicies.map((i) => ({
        target: i,
      })),
      abi: abiPolicies.find((m) => m.name === 'rate'),
    })
  ).output.map((o) => o.output);

  const maxBorrowable = (
    await sdk.api.abi.multiCall({
      calls: controllers.map((i) => ({
        target: i,
        params: [
          // wbtc
          i === '0x4e59541306910aD6dC1daC0AC9dFB29bD9F15c67'
            ? 100000000n
            : 1000000000000000000n,
          4,
        ],
      })),
      abi: abiControllers.find((m) => m.name === 'max_borrowable'),
    })
  ).output.map((o) => o.output);

  const collateralBalance = (
    await sdk.api.abi.multiCall({
      calls: collateralTokens.map((t, i) => ({
        target: t,
        params: amms[i],
      })),
      abi: 'erc20:balanceOf',
    })
  ).output.map((o) => o.output);

  const totalDebt = (
    await sdk.api.abi.multiCall({
      calls: controllers.map((i) => ({
        target: i,
      })),
      abi: abiControllers.find((m) => m.name === 'total_debt'),
    })
  ).output.map((o) => o.output);

  const debtCeiling = (
    await sdk.api.abi.multiCall({
      calls: controllers.map((t) => ({
        target: factory,
        params: t,
      })),
      abi: abiFactory.find((m) => m.name === 'debt_ceiling'),
    })
  ).output.map((o) => o.output);

  const coins = [...collateralTokens, crvUsd].map((t) => `ethereum:${t}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).data.coins;

  const crvUsdPrice = prices[`ethereum:${crvUsd}`].price;

  const pools = collateralTokens.map((t, i) => {
    const token = prices[`ethereum:${t}`];
    const price = token.price;
    const decimals = token.decimals;
    const symbol = token.symbol;

    const totalSupplyUsd = (collateralBalance[i] * price) / 10 ** decimals;
    const totalBorrowUsd = totalDebt[i] / 1e18;
    // cdp
    const tvlUsd = totalSupplyUsd;
    const debtCeilingUsd = debtCeiling[i] / 1e18;

    // https://docs.curve.fi/crvUSD/monetarypolicy/#interest-rates
    const apyBaseBorrow =
      ((1 + rates[i] / 1e18) ** (365 * 24 * 60 * 60) - 1) * 100;

    const ltv = ((maxBorrowable[i] / 1e18) * crvUsdPrice) / price;

    return {
      pool: amms[i],
      symbol,
      project: 'crvusd',
      chain: 'ethereum',
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      debtCeilingUsd,
      apyBase: 0,
      apyBaseBorrow,
      underlyingTokens: [collateralTokens[i]],
      mintedCoin: 'crvusd',
      ltv,
    };
  });

  return pools.filter(
    (i) => i.pool !== '0x136e783846ef68C8Bd00a3369F787dF8d683a696'
  );
};

module.exports = {
  apy,
  url: 'https://crvusd.curve.fi/#/ethereum/markets',
};
