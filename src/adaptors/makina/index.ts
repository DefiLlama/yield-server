/**
 * Makina Protocol
 *
 * DeFiLlama slug: makina
 * DefiLlama page: https://defillama.com/protocol/makina
 * App: https://makina.finance/
 * API Docs: https://api.makina.finance/v1/docs
 * Protocol docs: https://docs.makina.finance/
 *
 * The Makina API is used only as a directory of strategies (machine) as they rely on events. Every live metric — AUM, share price
 * and APY — is read directly on-chain:
 *   - AUM:         machine.lastTotalAum()   (accounting-token base units)
 *   - shareSupply: shareToken.totalSupply()
 *   - sharePrice:  (aum / 10^accDec) / (supply / 10^shareDec)
 *   - apyBase:     7d change of sharePrice (now vs the block ~7 days ago),
 *                  annualized. null when 7d-ago state is unavailable.
 */

const sdk = require('@defillama/sdk');

const utils = require('../utils');

type Pool = import('../../types/Pool').Pool;
type MakinaStrategiesResponse = import('./types').MakinaStrategiesResponse;
type Strategy = MakinaStrategiesResponse['data']['strategies'][number];

// Raw uint256 read returned by the SDK multicall (decimal string), or null when
// that individual call failed (permitFailure).
type RawValue = string | null;

// AUM and share supply for a batch of strategies, index-aligned with the input.
interface Snapshot {
  aums: RawValue[];
  supplies: RawValue[];
}

// Shape of `sdk.api.abi.multiCall`'s result with `permitFailure: true`.
interface MultiCallResult {
  output: Array<{ output: RawValue }>;
}

const PROJECT = 'makina';

// API Docs: https://api.makina.finance/v1/docs
const API_BASE_URL = 'https://api.makina.finance/v1';

const CHAIN_ID_TO_CHAIN_KEY: Record<number, string> = {
  1: 'ethereum',
  143: 'monad',
  999: 'hyperliquid',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avax',
  57073: 'ink',
};

const ENDPOINTS = {
  GET_STRATEGIES: `${API_BASE_URL}/strategies`,
};

const DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 7;

const LAST_TOTAL_AUM_ABI = 'uint256:lastTotalAum';
const TOTAL_SUPPLY_ABI = 'uint256:totalSupply';

// De-scaled share price, in accounting tokens per share. null when inputs are
// missing or the share supply is zero.
const computeSharePrice = (
  aum: RawValue,
  supply: RawValue,
  accDec: number,
  shareDec: number
): number | null => {
  if (aum == null || supply == null) return null;
  const supplyNum = Number(supply);
  if (!(supplyNum > 0)) return null;
  return Number(aum) / 10 ** accDec / (supplyNum / 10 ** shareDec);
};

// Reads lastTotalAum() for every machine and totalSupply() for every share
// token in `strategies`, on `sdkChain`, pinned to `block` (latest when null).
// Returns aligned arrays of raw values (null on per-call failure).
const readSnapshots = async (
  strategies: { address: string; shareToken: { address: string } }[],
  sdkChain: string,
  block: number | null
): Promise<Snapshot> => {
  const [aums, supplies] = (await Promise.all([
    sdk.api.abi.multiCall({
      abi: LAST_TOTAL_AUM_ABI,
      calls: strategies.map((s) => ({ target: s.address })),
      chain: sdkChain,
      block,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: TOTAL_SUPPLY_ABI,
      calls: strategies.map((s) => ({ target: s.shareToken.address })),
      chain: sdkChain,
      block,
      permitFailure: true,
    }),
  ])) as [MultiCallResult, MultiCallResult];
  return {
    aums: aums.output.map((o) => o.output),
    supplies: supplies.output.map((o) => o.output),
  };
};

const apy = async () => {
  const response = await utils.getData(ENDPOINTS.GET_STRATEGIES);
  const strategies: MakinaStrategiesResponse['data'] = response.data;

  const supportedStrategies = strategies.strategies.filter(
    (s) => CHAIN_ID_TO_CHAIN_KEY[s.accountingToken.chainId]
  );

  // Prices for every accounting token, keyed by the coins-API chain key.
  const priceKeys = [
    ...new Set(
      supportedStrategies.map(
        (s) =>
          `${CHAIN_ID_TO_CHAIN_KEY[s.accountingToken.chainId]}:${
            s.accountingToken.address
          }`
      )
    ),
  ];
  const { pricesByAddress } = (await utils.getPrices(priceKeys, null)) as {
    pricesByAddress: Record<string, number>;
  };

  // Group by hub chain so on-chain reads can be batched per chain/block.
  const byChain = supportedStrategies.reduce<Record<number, Strategy[]>>(
    (acc, s) => {
      (acc[s.hubChainId] = acc[s.hubChainId] || []).push(s);
      return acc;
    },
    {}
  );

  const ts7dAgo = Math.floor(Date.now() / 1000) - APY_LOOKBACK_DAYS * DAY;

  const apys: Pool[] = [];

  for (const hubChainId of Object.keys(byChain).map(Number)) {
    const chainStrategies = byChain[hubChainId];
    const sdkChain = CHAIN_ID_TO_CHAIN_KEY[hubChainId];

    let block7dAgo: number | null = null;
    try {
      [block7dAgo] = await utils.getBlocksByTime([ts7dAgo], sdkChain);
    } catch (e) {
      block7dAgo = null;
    }

    const [now, prior] = await Promise.all([
      readSnapshots(chainStrategies, sdkChain, null),
      block7dAgo != null
        ? readSnapshots(chainStrategies, sdkChain, block7dAgo)
        : Promise.resolve(null),
    ]);

    chainStrategies.forEach((strategy, i) => {
      const { accountingToken, shareToken } = strategy;
      const accDec = accountingToken.decimals;
      const shareDec = shareToken.decimals;

      const aum = now.aums[i];
      const supply = now.supplies[i];
      if (aum == null || supply == null) return;

      const price = pricesByAddress[accountingToken.address.toLowerCase()];
      if (price == null) return;

      const sharePrice = computeSharePrice(aum, supply, accDec, shareDec);
      if (sharePrice == null) return;

      const tvlUsd = (Number(aum) / 10 ** accDec) * price;

      // On-chain 7d APY: sharePrice change from ~7 days ago, annualized.
      // null when the prior snapshot is unavailable (e.g. new strategy).
      let apyBase: number | null = null;
      if (prior != null) {
        const sharePrice7d = computeSharePrice(
          prior.aums[i],
          prior.supplies[i],
          accDec,
          shareDec
        );
        if (sharePrice7d != null && sharePrice7d > 0) {
          apyBase =
            ((sharePrice / sharePrice7d) ** (365 / APY_LOOKBACK_DAYS) - 1) *
            100;
        }
      }

      apys.push({
        pool: `makina-${strategy.address}-${
          CHAIN_ID_TO_CHAIN_KEY[strategy.hubChainId]
        }`,
        chain: utils.formatChain(CHAIN_ID_TO_CHAIN_KEY[strategy.hubChainId]),
        project: PROJECT,
        symbol: shareToken.symbol,
        token: shareToken.address,
        underlyingTokens: [accountingToken.address],
        apyBase,
        pricePerShare: sharePrice, // accounting tokens per share; NOT a USD price.
        tvlUsd,
        url: `https://makina.finance/strategy/${strategy.address}`,
      });
    });
  }

  return apys;
};

module.exports = {
  protocolId: '6964',
  timetravel: false,
  apy: apy,
  url: 'https://makina.finance/explore',
};
