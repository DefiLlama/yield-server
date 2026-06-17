const dolomiteMarginAbi = require('./dolomite-margin-abi.js');
const isolationModeAbi = require('./isolation-mode-token-abi.js');
const sdk = require('@defillama/sdk');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const DOLOMITE_MARGIN_ADDRESS_MAP = {
  arbitrum: '0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072',
  berachain: '0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D',
  ethereum: '0x003Ca23Fd5F0ca87D01F6eC6CD14A8AE60c2b97D',
};
const getMarketMaxBorrowWeiAbi = {
  name: 'getMarketMaxBorrowWei',
  type: 'function',
  inputs: [{ name: 'marketId', type: 'uint256' }],
  outputs: [{
    type: 'tuple',
    components: [
      { name: 'sign', type: 'bool' },
      { name: 'value', type: 'uint256' },
    ],
  }],
  stateMutability: 'view',
};

async function apy() {
  const allPools = await Promise.all(
    Object.entries(DOLOMITE_MARGIN_ADDRESS_MAP).map(
      async ([chain, dolomiteMargin]) => {
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

        const maxBorrowWeiRes = await sdk.api.abi.multiCall({
          abi: getMarketMaxBorrowWeiAbi,
          calls: range.map((i) => ({
            target: dolomiteMargin,
            params: i,
          })),
          chain: chain,
          permitFailure: true,
        });
        const maxBorrowWeis = maxBorrowWeiRes.output.map((o) => o.success ? o.output : null);

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

        // Track which tokens are isolation mode dTokens (ERC20 receipt tokens)
        const receiptTokens = new Array(names.length).fill(null);
        for (let i = 0; i < names.length; i++) {
          if (names[i] === 'Dolomite Isolation: Arbitrum' || names[i] === 'GMX' || names[i] === 'Infrared BGT') {
            tokens[i] = undefined;
            symbols[i] = undefined;
          } else if (
            names[i] === 'Dolomite: Fee + Staked GLP' ||
            names[i].includes('Dolomite Isolation:')
          ) {
            receiptTokens[i] = tokens[i]; // preserve dToken as receipt
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
        const maxBorrowUsds = maxBorrowWeis.map((maxBorrowWei, i) =>
          maxBorrowWei && Number(maxBorrowWei.value) > 0
            ? (Number(maxBorrowWei.value) * prices[i]) / 1e36
            : null
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
            const availableBorrowUsd = borrowables[i]
              ? Math.max(
                  Math.min(
                    supplyUsds[i] - borrowUsds[i],
                    maxBorrowUsds[i] === null
                      ? Infinity
                      : maxBorrowUsds[i] - borrowUsds[i]
                  ),
                  0
                )
              : 0;
            acc.push({
              pool: `${tokens[i]}-dolomite-${chain}`.toLowerCase(),
              symbol: symbols[i],
              chain: chain.charAt(0).toUpperCase() + chain.slice(1),
              project: 'dolomite',
              token: receiptTokens[i] || null,
              tvlUsd: supplyUsds[i] - borrowUsds[i],
              apyBase: supplyInterestRateApys[i],
              ...(Number(indices[i].supply) / 1e18 > 0 && { pricePerShare: Number(indices[i].supply) / 1e18 }),
              underlyingTokens: [tokens[i]],
              apyBaseBorrow: borrowInterestRateApys[i],
              borrowToken: tokens[i],
              totalSupplyUsd: supplyUsds[i],
              totalBorrowUsd: borrowUsds[i],
              availableBorrowUsd,
              ltv: 1 / (1 + marginRatio + (1 + marginRatio) * marginPremiums[i]),
              url: `https://app.dolomite.io/stats/token/${tokens[
                i
              ].toLowerCase()}`,
              borrowable: borrowables[i],
            });
          }
          return acc;
        }, []);
    })
  );

  return addMerklRewardApy(allPools.flat(), 'dolomite', (p) => p.pool.split('-')[0]);
}

module.exports = {
  protocolId: '2187',
  timetravel: true,
  apy,
  url: 'https://app.dolomite.io/stats',
};
