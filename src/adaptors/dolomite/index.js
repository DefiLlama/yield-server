const dolomiteMarginAbi = require('./dolomite-margin-abi.js');
const isolationModeAbi = require('./isolation-mode-token-abi.js');
const sdk = require('@defillama/sdk');

const DOLOMITE_MARGIN_ADDRESS_MAP = {
  arbitrum: '0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072',
};

async function apy() {
  return Object.keys(DOLOMITE_MARGIN_ADDRESS_MAP).reduce(
    async (memo, chain) => {
      const dolomiteMargin = DOLOMITE_MARGIN_ADDRESS_MAP[chain];

      const marginRatio =
        Number(
          (
            await sdk.api.abi.call({
              target: dolomiteMargin,
              abi: dolomiteMarginAbi.find((i) => i.name === 'getMarginRatio'),
              chain: chain,
              permitFailure: true,
            })
          ).output
        ) / 1e18;

      const earningsRate =
        Number(
          (
            await sdk.api.abi.call({
              target: dolomiteMargin,
              abi: dolomiteMarginAbi.find((i) => i.name === 'getEarningsRate'),
              chain: chain,
              permitFailure: true,
            })
          ).output
        ) / 1e18;

      const numMarkets = Number(
        (
          await sdk.api.abi.call({
            target: dolomiteMargin,
            abi: dolomiteMarginAbi.find((i) => i.name === 'getNumMarkets'),
            chain: chain,
            permitFailure: true,
          })
        ).output
      );
      const range = [...Array(numMarkets).keys()];

      // contains token addresses and c-factors
      const tokensRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketTokenAddress'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const tokens = tokensRes.output.map((o) => o.output);

      const borrowablesRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketIsClosing'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const borrowables = borrowablesRes.output.map((o) => !o.output);

      const totalParsRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketTotalPar'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const totalPars = totalParsRes.output.map((o) => o.output);

      const indicesRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketCurrentIndex'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const indices = indicesRes.output.map((o) => o.output);

      const pricesRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketPrice'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const prices = pricesRes.output.map((o) => o.output);

      const interestRatesRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketInterestRate'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const interestRates = interestRatesRes.output.map((o) => o.output);

      const marginPremiumsRes = await sdk.api.abi.multiCall({
        abi: dolomiteMarginAbi.find((i) => i.name === 'getMarketMarginPremium'),
        calls: range.map((i) => ({
          target: dolomiteMargin,
          params: i,
        })),
        chain: chain,
        permitFailure: true,
      });
      const marginPremiums = marginPremiumsRes.output.map(
        (o) => Number(o.output) / 1e18
      );

      const symbolsRes = await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: tokens.map((t) => ({
          target: t,
        })),
        chain: chain,
        permitFailure: true,
      });
      const symbols = symbolsRes.output.map((o) => o.output);

      const namesRes = await sdk.api.abi.multiCall({
        abi: isolationModeAbi.find((i) => i.name === 'name'),
        calls: tokens.map((t) => ({
          target: t,
        })),
        chain: chain,
        permitFailure: true,
      });
      const names = namesRes.output.map((o) => o.output);

      for (let i = 0; i < names.length; i++) {
        if (names[i] === 'Dolomite Isolation: Arbitrum' || names[i] === 'GMX') {
          tokens[i] = undefined;
          symbols[i] = undefined;
        } else if (
          names[i] === 'Dolomite: Fee + Staked GLP' ||
          names[i].includes('Dolomite Isolation:')
        ) {
          const underlyingToken = await sdk.api.abi.call({
            abi: isolationModeAbi.find((i) => i.name === 'UNDERLYING_TOKEN'),
            target: tokens[i],
            chain: chain,
          });
          tokens[i] = underlyingToken.output;
          symbols[i] = symbols[i].substring(1); // strip the 'd' from the symbol
        }
      }

      const supplyWeis = totalPars.map(
        (totalPar, i) =>
          (Number(totalPar.supply) * Number(indices[i].supply)) / 1e18
      );
      const borrowWeis = totalPars.map(
        (totalPar, i) =>
          (Number(totalPar.borrow) * Number(indices[i].borrow)) / 1e18
      );
      const supplyUsds = supplyWeis.map(
        (supplyWei, i) => (supplyWei * prices[i]) / 1e36
      );
      const borrowUsds = borrowWeis.map(
        (borrowWei, i) => (borrowWei * prices[i]) / 1e36
      );

      const secondsInYear = 31_536_000;
      const borrowInterestRateApys = interestRates.map((interestRate) => {
        const apr = (Number(interestRate) * secondsInYear) / 1e18;
        return (Math.pow(1 + apr / 365, 365) - 1) * 100;
      });
      const supplyInterestRateApys = borrowInterestRateApys.map(
        (interestRate, i) => {
          if (interestRate === 0) {
            return 0;
          } else {
            return (
              (interestRate * earningsRate * borrowWeis[i]) / supplyWeis[i]
            );
          }
        }
      );

      return range.reduce((acc, i) => {
        if (tokens[i]) {
          acc.push({
            pool: `${tokens[i]}-${chain}`.toLowerCase(),
            symbol: symbols[i],
            chain: chain.charAt(0).toUpperCase() + chain.slice(1),
            project: 'dolomite',
            tvlUsd: supplyUsds[i] - borrowUsds[i],
            apyBase: supplyInterestRateApys[i],
            apyReward: 0,
            underlyingTokens: [tokens[i]],
            rewardTokens: [],
            apyBaseBorrow: borrowInterestRateApys[i],
            apyRewardBorrow: 0,
            totalSupplyUsd: supplyUsds[i],
            totalBorrowUsd: borrowUsds[i],
            ltv: 1 / (1 + marginRatio + (1 + marginRatio) * marginPremiums[i]),
            poolMeta: 'Dolomite Balance',
            url: `https://app.dolomite.io/stats/token/${tokens[
              i
            ].toLowerCase()}`,
            borrowable: borrowables[i],
          });
        }
        return acc;
      }, []);
    },
    []
  );
}

module.exports = {
  timetravel: true,
  apy,
  url: 'https://app.dolomite.io/stats',
};
