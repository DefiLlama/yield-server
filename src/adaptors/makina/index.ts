/**
 * Makina Protocol
 *
 * DeFiLlama slug: makina
 * DefiLlama page: https://defillama.com/protocol/makina
 * App: https://makina.finance/
 * Protocol docs: https://docs.makina.finance/
 *
 * Strategies (machines) are discovered from MachineCreated events on each hub
 * chain's HubCoreFactory, so new machines are listed without adapter changes.
 * Every metric is read on-chain:
 *   - AUM:         machine.lastTotalAum()   (accounting-token base units)
 *   - shareSupply: shareToken.totalSupply()
 *   - sharePrice:  (aum / 10^accDec) / (supply / 10^shareDec)
 *   - poolMeta:    shareToken.name()
 *   - apyBase:     7d change of sharePrice (now vs the block ~7 days ago),
 *                  annualized. null when 7d-ago state is unavailable.
 */

const sdk = require('@defillama/sdk');

const utils = require('../utils');

type Pool = import('../../types/Pool').Pool;

interface Strategy {
  chain: string;
  address: string;
  shareToken: {
    address: string;
    name: string | null;
    symbol: string;
    decimals: number;
  };
  accountingToken: { address: string; decimals: number };
}

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

// HubCoreFactory per hub chain. fromBlock is its first machine deployment.
const HUBS: Record<string, { factory: string; fromBlock: number }> = {
  ethereum: {
    factory: '0x8d28A69328561eF9F171c58996fEcB9F494e070c',
    fromBlock: 23426666,
  },
  base: {
    factory: '0x1E1fa6F5f258b744881634216bDBc612B09C3C30',
    fromBlock: 50872000,
  },
};

const MACHINE_CREATED_EVENT =
  'event MachineCreated(address indexed machine, address indexed shareToken)';

// Stay behind the head: the SDK pads log ranges by 10 blocks and public RPCs
// can lag the latest block.
const LOGS_HEAD_MARGIN = 20;

const DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 7;

const LAST_TOTAL_AUM_ABI = 'uint256:lastTotalAum';
const TOTAL_SUPPLY_ABI = 'uint256:totalSupply';
const ACCOUNTING_TOKEN_ABI = 'address:accountingToken';

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

// Lists every machine deployed by the chain's HubCoreFactory, with the share
// and accounting token metadata needed for pricing and display.
const discoverStrategies = async (chain: string): Promise<Strategy[]> => {
  const { factory, fromBlock } = HUBS[chain];
  const { number: latestBlock } = await sdk.api.util.getLatestBlock(chain);
  const logs: Array<{ machine: string; shareToken: string }> =
    await sdk.getEventLogs({
      chain,
      target: factory,
      eventAbi: MACHINE_CREATED_EVENT,
      fromBlock,
      toBlock: latestBlock - LOGS_HEAD_MARGIN,
      onlyArgs: true,
    });

  // permitFailure: a misconfigured machine is skipped instead of failing the adaptor
  const read = (abi: string, targets: string[]): Promise<RawValue[]> =>
    sdk.api.abi
      .multiCall({
        abi,
        calls: targets.map((target) => ({ target })),
        chain,
        permitFailure: true,
      })
      .then((res: MultiCallResult) => res.output.map((o) => o.output));

  const accountingTokens = await read(
    ACCOUNTING_TOKEN_ABI,
    logs.map((l) => l.machine)
  );
  const machines = logs
    .map((l, i) => ({ ...l, accountingToken: accountingTokens[i] }))
    .filter((m) => m.accountingToken != null);
  const shareTokens = machines.map((m) => m.shareToken);
  const [shareNames, shareSymbols, shareDecimals, accDecimals] =
    await Promise.all([
      read('string:name', shareTokens),
      read('erc20:symbol', shareTokens),
      read('erc20:decimals', shareTokens),
      read(
        'erc20:decimals',
        machines.map((m) => m.accountingToken)
      ),
    ]);

  return machines
    .map((m, i) => ({
      chain,
      address: m.machine,
      shareToken: {
        address: m.shareToken,
        name: shareNames[i],
        symbol: shareSymbols[i],
        decimals: Number(shareDecimals[i]),
      },
      accountingToken: {
        address: m.accountingToken,
        decimals: Number(accDecimals[i]),
      },
    }))
    .filter(
      (_, i) =>
        shareSymbols[i] != null &&
        shareDecimals[i] != null &&
        accDecimals[i] != null
    );
};

const apy = async () => {
  const strategies = (
    await Promise.all(Object.keys(HUBS).map(discoverStrategies))
  ).flat();

  // Prices for every accounting token, keyed by the coins-API chain key.
  const priceKeys = [
    ...new Set(
      strategies.map((s) => `${s.chain}:${s.accountingToken.address}`)
    ),
  ];
  const { pricesByAddress } = (await utils.getPrices(priceKeys, null)) as {
    pricesByAddress: Record<string, number>;
  };

  const ts7dAgo = Math.floor(Date.now() / 1000) - APY_LOOKBACK_DAYS * DAY;

  const apys: Pool[] = [];

  for (const sdkChain of Object.keys(HUBS)) {
    const chainStrategies = strategies.filter((s) => s.chain === sdkChain);

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
        pool: `makina-${strategy.address}-${sdkChain}`,
        chain: utils.formatChain(sdkChain),
        project: PROJECT,
        symbol: shareToken.symbol,
        poolMeta: shareToken.name ?? undefined,
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
