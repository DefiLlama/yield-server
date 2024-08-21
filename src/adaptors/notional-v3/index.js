const { request, gql } = require('graphql-request');
const utils = require('../utils');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const API = (chain) =>
  chain === 'ethereum'
    ? `https://data-dev.notional.finance/mainnet/yields`
    : `https://data-dev.notional.finance/${chain}/yields`;
const NOTE_Mainnet = '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5';

const SUBGRAPHS = {
  arbitrum:
    'https://api.studio.thegraph.com/query/60626/notional-v3-arbitrum/version/latest',
  ethereum:
    'https://api.studio.thegraph.com/query/60626/notional-v3-mainnet/version/latest',
};

const query = gql`
  query GetYieldsData {
    oracles(
      where: {
        matured: false
        oracleType_in: [
          nTokenToUnderlyingExchangeRate
          nTokenBlendedInterestRate
          nTokenFeeRate
          nTokenIncentiveRate
          nTokenSecondaryIncentiveRate
        ]
      }
      first: 1000
    ) {
      base {
        id
      }
      quote {
        id
        symbol
      }
      decimals
      oracleType
      latestRate
    }
    NOTE: tokens(where: { tokenType: NOTE }) {
      id
    }
    # Use this to calculate the nToken TVL
    nTokens: tokens(where: { tokenType: nToken }) {
      id
      symbol
      totalSupply
      currencyId
      underlying {
        id
        symbol
        decimals
      }
    }
    activeMarkets {
      pCashMarket {
        underlying {
          id
          symbol
          decimals
        }
        primeCash {
          id
          symbol
          decimals
        }
        primeDebt {
          id
          symbol
          decimals
        }
        current {
          totalPrimeCashInUnderlying
          totalPrimeDebtInUnderlying
          supplyInterestRate
          debtInterestRate
        }
      }
      fCashMarkets {
        maturity
        underlying {
          id
          symbol
          decimals
        }
        fCash {
          id
          symbol
          decimals
        }
        current {
          lastImpliedRate
          totalfCashPresentValue
          totalPrimeCashInUnderlying
          totalfCashDebtOutstandingPresentValue
        }
      }
    }
    incentives {
      id
      currentSecondaryReward {
        id
      }
    }
  }
`;

async function getUSDPrice(chain, address) {
  // price of base token in USD terms
  const key = `${chain}:${address}`;
  const priceRes = await superagent.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  const price = priceRes.body.coins[key];
  return price ? price.price : 0;
}

const defaultLeverageRatio = 3.5;

function unique(arr) {
  return arr.filter((el, index, source) => source.indexOf(el) === index);
}

const getPools = async (chain) => {
  let results = await request(SUBGRAPHS[chain], query);
  const project = 'notional-v3';
  const NOTE = results['NOTE'][0].id;
  const NOTEPriceUSD = await getUSDPrice('ethereum', NOTE_Mainnet);
  const notionalChain = chain === 'ethereum' ? 'mainnet' : chain;

  const nTokens = await Promise.all(
    results['nTokens'].map(async (n) => {
      const oracles = results['oracles'].filter(
        ({ quote: { symbol } }) => symbol === n.symbol
      );
      const nTokenExRate = oracles.find(
        ({ oracleType }) => oracleType === 'nTokenToUnderlyingExchangeRate'
      ).latestRate;
      const nTokenBlendedRate = oracles.find(
        ({ oracleType }) => oracleType === 'nTokenBlendedInterestRate'
      ).latestRate;
      const nTokenFeeRate = oracles.find(
        ({ oracleType }) => oracleType === 'nTokenFeeRate'
      ).latestRate;

      // NOTE incentive rate
      const nTokenIncentiveRate =
        oracles.find(({ oracleType }) => oracleType === 'nTokenIncentiveRate')
          ?.latestRate || 0;
      const underlyingDecimals = BigInt(10) ** BigInt(n.underlying.decimals);
      const tvlUnderlying =
        (BigInt(n.totalSupply) * BigInt(nTokenExRate)) / BigInt(1e9);
      const underlyingPrice = await getUSDPrice(chain, n.underlying.id);
      const tvlUsd = (Number(tvlUnderlying) / 1e8) * underlyingPrice;
      const NOTEPriceInUnderlying = NOTEPriceUSD / underlyingPrice;

      let apyReward =
        (Number(nTokenIncentiveRate) * NOTEPriceInUnderlying * 100) / 1e9;

      const secondaryIncentiveToken = results['incentives'].find(
        (i) => i.id === `${n.currencyId}`
      );
      const nTokenSecondaryIncentiveRate =
        oracles.find(
          ({ oracleType }) => oracleType === 'nTokenSecondaryIncentiveRate'
        )?.latestRate || 0;
      const rewardTokens = [NOTE];

      if (
        secondaryIncentiveToken.currentSecondaryReward !== null &&
        nTokenSecondaryIncentiveRate
      ) {
        const token = secondaryIncentiveToken.currentSecondaryReward.id;
        rewardTokens.push(token);
        const rewardPriceUSD = await getUSDPrice(chain, token);
        const PriceInUnderlying = rewardPriceUSD / underlyingPrice;
        const apySecondary =
          (Number(nTokenSecondaryIncentiveRate) * PriceInUnderlying * 100) /
          1e17;
        apyReward = apyReward + apySecondary;
      }

      return {
        pool: `${n.id}-${chain}`,
        chain,
        project,
        symbol: n.symbol,
        rewardTokens,
        underlyingTokens: [n.underlying.id],
        poolMeta: 'Liquidity Token',
        url: `https://notional.finance/liquidity-variable/${notionalChain}/${n.underlying.symbol}`,
        tvlUsd,
        apyBase:
          ((Number(nTokenBlendedRate) + Number(nTokenFeeRate)) * 100) / 1e9,
        apyReward,
      };
    })
  );

  const primeCash = await Promise.all(
    results['activeMarkets'].map(async ({ pCashMarket: p }) => {
      const underlyingDecimals = BigNumber(10).pow(p.underlying.decimals);
      const totalSupplyUnderlying = BigNumber(
        p.current.totalPrimeCashInUnderlying
      ).div(underlyingDecimals);
      const totalDebtUnderlying = BigNumber(
        p.current.totalPrimeDebtInUnderlying || 0
      ).div(underlyingDecimals);
      const tvlUnderlying = totalSupplyUnderlying.minus(totalDebtUnderlying);
      const underlyingPrice = await getUSDPrice(chain, p.underlying.id);
      const tvlUsd = tvlUnderlying.times(underlyingPrice).toNumber();
      const totalSupplyUsd = totalSupplyUnderlying
        .times(underlyingPrice)
        .toNumber();
      const totalBorrowUsd = totalDebtUnderlying
        .times(underlyingPrice)
        .toNumber();

      return {
        pool: `${p.primeCash.id}-${chain}`,
        chain,
        project,
        symbol: p.primeCash.symbol,
        underlyingTokens: [p.underlying.id],
        poolMeta: 'Variable Lend',
        url: `https://notional.finance/lend-variable/${notionalChain}/${p.underlying.symbol}`,
        tvlUsd,
        apyBase: (Number(p.current.supplyInterestRate) * 100) / 1e9,
        apyBaseBorrow: (Number(p.current.debtInterestRate) * 100) / 1e9,
        totalSupplyUsd,
        totalBorrowUsd,
      };
    })
  );

  const fCash = await Promise.all(
    results['activeMarkets'].flatMap(({ fCashMarkets }) => {
      return fCashMarkets.map(async (f) => {
        const underlyingDecimals = BigNumber(10).pow(f.underlying.decimals);
        const totalfCashUnderlying = BigNumber(
          f.current.totalfCashPresentValue
        ).div(underlyingDecimals);
        const totalDebtUnderlying = BigNumber(
          f.current.totalfCashDebtOutstandingPresentValue
        ).div(-underlyingDecimals);
        const tvlUnderlying = totalfCashUnderlying
          .plus(BigNumber(f.current.totalPrimeCashInUnderlying))
          .div(underlyingDecimals);

        const underlyingPrice = await getUSDPrice(chain, f.underlying.id);
        const tvlUsd = tvlUnderlying.times(underlyingPrice).toNumber();
        const totalSupplyUsd = totalfCashUnderlying
          .times(underlyingPrice)
          .toNumber();
        const totalBorrowUsd = totalDebtUnderlying
          .times(underlyingPrice)
          .toNumber();
        const date = new Date(Number(f.maturity) * 1000)
          .toISOString()
          .split('T')[0];

        return {
          pool: `${f.fCash.id}-${chain}`,
          chain,
          project,
          symbol: `f${f.underlying.symbol}`,
          underlyingTokens: [f.underlying.id],
          poolMeta: `Fixed Lend Maturing On ${date}`,
          url: `https://notional.finance/lend-fixed/${notionalChain}/${f.underlying.symbol}`,
          tvlUsd,
          apyBase: (Number(f.current.lastImpliedRate) * 100) / 1e9,
          apyBaseBorrow: (Number(f.current.lastImpliedRate) * 100) / 1e9,
          totalSupplyUsd,
          totalBorrowUsd,
        };
      });
    })
  );

  const leveragedLiquidity = nTokens.map((n) => {
    const lowestBorrow = primeCash
      .concat(fCash)
      .filter(
        ({ underlyingTokens }) => underlyingTokens[0] === n.underlyingTokens[0]
      )
      .reduce((l, b) => {
        if (!l || (l && b.apyBaseBorrow < l.apyBaseBorrow)) return b;
        else return l;
      });
    const apyBase =
      n.apyBase +
      (n.apyBase - lowestBorrow.apyBaseBorrow) * defaultLeverageRatio;
    // Borrow rates are applied to the apyBase only
    const apyReward = n.apyReward + n.apyReward * defaultLeverageRatio;
    const underlyingSymbol = results['nTokens'].find(
      (d) => d.symbol == n.symbol
    )?.underlying.symbol;

    return {
      pool: `${n.pool}-leveraged`,
      chain: n.chain,
      project: n.project,
      symbol: n.symbol,
      rewardTokens: n.rewardTokens,
      underlyingTokens: n.underlyingTokens,
      poolMeta: 'Leveraged Liquidity Token',
      url: `https://notional.finance/liquidity-leveraged/${notionalChain}/CreateLeveragedNToken/${underlyingSymbol}`,
      tvlUsd: n.tvlUsd,
      // "base" apy is the total leveraged apy minus the reward apy
      apyBase,
      apyReward,
    };
  });

  // NOTE: internal API results are only used for vaults, which often have off-chain custom
  // calculations to get the current APY
  const apiResults = await utils.getData(API(chain));
  const vaultAddresses = unique(
    apiResults
      .filter((r) => r.token.tokenType === 'VaultShare' && !!r['leveraged'])
      .map((r) => r.token.vaultAddress)
  );

  const allVaultMaturities = apiResults.filter(
    (r) => r.token.tokenType === 'VaultShare' && !!r['leveraged']
  );
  const vaults = await Promise.all(
    vaultAddresses.map(async (vaultAddress) => {
      const maturities = apiResults.filter(
        (r) => r.token.vaultAddress === vaultAddress && !!r['leveraged']
      );
      const tvlUnderlying = maturities.reduce(
        (tvl, m) => tvl.plus(new BigNumber(m.tvl.hex)),
        new BigNumber(0)
      );
      const highestYield = maturities.reduce((h, m) => {
        if (!h || (h && h.totalAPY < m.totalAPY)) return m;
        else return h;
      });

      const underlyingPrice = await getUSDPrice(
        chain,
        highestYield.underlying.id
      );
      const tvlUsd = tvlUnderlying
        .div(new BigNumber(10).pow(highestYield.underlying.decimals))
        .times(underlyingPrice)
        .toNumber();

      return {
        pool: `${vaultAddress}-${chain}`,
        chain,
        project,
        symbol: highestYield.vaultName,
        underlyingTokens: [highestYield.underlying.id],
        poolMeta: 'Leveraged Vault',
        url: `https://notional.finance/vaults/${notionalChain}/${vaultAddress}`,
        tvlUsd,
        apyBase: highestYield.totalAPY,
      };
    })
  );

  return nTokens
    .concat(primeCash)
    .concat(fCash)
    .concat(leveragedLiquidity)
    .concat(vaults);
};

const main = async () => {
  return Object.keys(SUBGRAPHS).reduce(async (acc, chain) => {
    return [...(await acc), ...(await getPools(chain))];
  }, Promise.resolve([]));
};

module.exports = {
  timetravel: false,
  apy: main,
};
