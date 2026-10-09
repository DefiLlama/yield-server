// Textile FX OperatorVaults
//
// An OperatorVault is an LP vault for one FX pair: a settlement asset (USDT,
// USDT0, USDC) and a corridor asset (cNGN, IDRX, TESOURO, ...). A market maker
// uses the inventory to fill FX swaps. Deposits and redemptions are async and
// epoch-based: LPs request, the epoch closes, and the vault processes it at a
// NAV that its strategy and risk signers attest to. Shares are a plain ERC-20
// with the settlement asset's decimals. The vault is not ERC-4626.
//
// tvlUsd  = lastSettledNav (`totalAssets()`, settlement units, recorded at
//           every processed deposit and settled redeem epoch) x the settlement
//           asset's USD price.
// apyBase = growth of lastSettledNav / totalSupply over the trailing 7 days,
//           annualised. Fee shares are minted at each checkpoint, so this is
//           net of fees. NAV only moves when an epoch is processed, so a 24h
//           window is either flat or one step; 7 days is steadier. Vaults with
//           less than 7 days of supply report 0 until they have the history.
//
// Discovery: vaults come from the factories' VaultDeployed logs. Public RPCs
// are unreliable for this on BSC (getLogs limits) and Celo (forno returns an
// empty set for older ranges instead of an error), so the curated list from
// Textile's API is merged in as a second source. Either source can fail on
// its own. Every candidate is then checked with `isVault` on a known factory,
// and all values are read on-chain, so the API only nominates addresses.
//
// The factories are permissionless and anyone can deploy a vault with signers
// they control. Such a vault could attest an inflated corridor price and
// report a NAV it doesn't hold, so a vault is dropped when its NAV is more
// than MAX_NAV_TO_LIVE x its live free balances priced by DefiLlama.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'textile-fx';
const APP_URL = 'https://app.textilecredit.com';
const LISTINGS_API = 'https://api.textilecredit.com/graphql';

const DAY = 24 * 3600;
const LOOKBACK_DAYS = 7;
const MAX_NAV_TO_LIVE = 2;

const CHAINS = {
  bsc: {
    chainId: 56,
    factories: [
      {
        address: '0x0eBe70c3417FF7fED5d8FE10F4FECBfA73E92917',
        fromBlock: 123347682,
      },
      {
        address: '0x5e461F214768B5Df054e98890bCBaCF7991e8c5f',
        fromBlock: 123573378,
      },
      {
        address: '0xe869402211F13a7Ecee3c5153B6E7136243D1Bf0',
        fromBlock: 125319157,
      },
    ],
  },
  celo: {
    chainId: 42220,
    factories: [
      {
        address: '0x88104decA449C797632AfdcA77A3140b24cD844A',
        fromBlock: 79051623,
      },
    ],
  },
  polygon: {
    chainId: 137,
    factories: [
      {
        address: '0x5a527d072C23d6Dac7DED486dE57ba941938ca35',
        fromBlock: 94829372,
      },
    ],
  },
};

// Keeps RPC fallback requests under public getLogs range limits.
const MAX_BLOCK_RANGE = 50_000;
// Stay a few blocks behind head; some RPCs reject ranges that touch it.
const HEAD_BUFFER = 50;

const ABI = {
  vaultDeployed:
    'event VaultDeployed(address indexed vault, address indexed operatorAdmin, address indexed settlementAsset, address corridorAsset, address strategySigner, uint256 version, string name, string symbol)',
  isVault: 'function isVault(address vault) view returns (bool)',
  paused: 'bool:paused',
  totalAssets: 'uint256:totalAssets',
  totalSupply: 'uint256:totalSupply',
  settlementAsset: 'address:settlementAsset',
  corridorAsset: 'address:corridorAsset',
  settlementDecimals: 'uint8:settlementDecimals',
  corridorDecimals: 'uint8:corridorDecimals',
  freeSettlement: 'uint256:freeSettlement',
  freeCorridor: 'uint256:freeCorridor',
  symbol: 'erc20:symbol',
};

const LISTINGS_QUERY = '{ operatorVaultListings { chainId address } }';

const lower = (address) => address.toLowerCase();

const multiCall = async (chain, abi, calls, block) =>
  (
    await sdk.api.abi.multiCall({
      chain,
      abi,
      calls,
      permitFailure: true,
      ...(block ? { block } : {}),
    })
  ).output.map((r) => r.output);

const callEach = (chain, abi, targets, block) =>
  multiCall(
    chain,
    abi,
    targets.map((target) => ({ target })),
    block
  );

const factoryVaults = async (chain, factory, toBlock) => {
  try {
    const logs = await sdk.getEventLogs({
      chain,
      target: factory.address,
      eventAbi: ABI.vaultDeployed,
      fromBlock: factory.fromBlock,
      toBlock,
      maxBlockRange: MAX_BLOCK_RANGE,
      onlyArgs: true,
    });
    return logs.map((log) => lower(log.vault));
  } catch (e) {
    return [];
  }
};

const discoverFromLogs = async (chain) => {
  const { number } = await sdk.api.util.getLatestBlock(chain);
  const perFactory = await Promise.all(
    CHAINS[chain].factories.map((f) =>
      factoryVaults(chain, f, number - HEAD_BUFFER)
    )
  );
  return perFactory.flat();
};

const fetchListings = async () => {
  try {
    const { data } = await utils.getData(LISTINGS_API, {
      query: LISTINGS_QUERY,
    });
    return data.operatorVaultListings;
  } catch (e) {
    return [];
  }
};

const listedOn = (listings, chain) =>
  listings
    .filter((l) => Number(l.chainId) === CHAINS[chain].chainId)
    .map((l) => lower(l.address));

// A candidate counts only if one of the chain's factories says it deployed it.
const keepFactoryVaults = async (chain, candidates) => {
  const factories = CHAINS[chain].factories.map((f) => f.address);
  const calls = candidates.flatMap((vault) =>
    factories.map((target) => ({ target, params: [vault] }))
  );
  const results = await multiCall(chain, ABI.isVault, calls);
  return candidates.filter((_, i) =>
    results
      .slice(i * factories.length, (i + 1) * factories.length)
      .some((r) => r === true)
  );
};

const readVaults = async (chain, vaults) => {
  const fields = [
    'paused',
    'totalAssets',
    'totalSupply',
    'settlementAsset',
    'corridorAsset',
    'settlementDecimals',
    'corridorDecimals',
    'freeSettlement',
    'freeCorridor',
  ];
  const columns = await Promise.all(
    fields.map((field) => callEach(chain, ABI[field], vaults))
  );
  return vaults.map((address, i) =>
    fields.reduce((acc, field, j) => ({ ...acc, [field]: columns[j][i] }), {
      address,
    })
  );
};

const lookbackBlock = async (chain) => {
  const timestamp = Math.floor(Date.now() / 1e3) - LOOKBACK_DAYS * DAY;
  const [block] = await utils.getBlocksByTime([timestamp], chain);
  return block;
};

// Share price `LOOKBACK_DAYS` ago, or null when the vault had no supply then
// or the archive read failed.
const readPriorSharePrices = async (chain, vaults) => {
  try {
    const block = await lookbackBlock(chain);
    const [assets, supply] = await Promise.all([
      callEach(chain, ABI.totalAssets, vaults, block),
      callEach(chain, ABI.totalSupply, vaults, block),
    ]);
    return vaults.map((_, i) => sharePrice(assets[i], supply[i]));
  } catch (e) {
    return vaults.map(() => null);
  }
};

const sharePrice = (assets, supply) => {
  const a = Number(assets);
  const s = Number(supply);
  return Number.isFinite(a) && Number.isFinite(s) && a > 0 && s > 0
    ? a / s
    : null;
};

const annualise = (priceNow, pricePrior) =>
  priceNow && pricePrior
    ? ((priceNow / pricePrior) ** (365 / LOOKBACK_DAYS) - 1) * 100
    : 0;

const fetchTokenInfo = async (chain, tokens) => {
  const [symbols, { coins }] = await Promise.all([
    callEach(chain, ABI.symbol, tokens),
    utils.getPriceApiData(
      `/prices/current/${tokens.map((t) => `${chain}:${t}`).join(',')}`
    ),
  ]);
  return Object.fromEntries(
    tokens.map((t, i) => [
      t,
      { symbol: symbols[i], price: coins?.[`${chain}:${t}`]?.price },
    ])
  );
};

// Tether's on-chain symbol is `USD₮` on some chains.
const cleanSymbol = (symbol) => utils.formatSymbol(symbol.replace(/₮/g, 'T'));

const units = (amount, decimals) => Number(amount) / 10 ** Number(decimals);

const toPool = (chain, vault, settlement, corridor, pricePrior) => {
  const navUsd =
    units(vault.totalAssets, vault.settlementDecimals) * settlement.price;
  const liveUsd =
    units(vault.freeSettlement, vault.settlementDecimals) * settlement.price +
    units(vault.freeCorridor, vault.corridorDecimals) * (corridor.price || 0);
  if (!(navUsd > 0) || navUsd > liveUsd * MAX_NAV_TO_LIVE) return null;

  const priceNow = sharePrice(vault.totalAssets, vault.totalSupply);
  return {
    pool: `${vault.address}-${chain}`,
    chain: utils.formatChain(chain),
    project: PROJECT,
    symbol: `${cleanSymbol(settlement.symbol)}-${cleanSymbol(corridor.symbol)}`,
    tvlUsd: navUsd,
    apyBase: annualise(priceNow, pricePrior),
    pricePerShare: priceNow,
    underlyingTokens: [vault.settlementAsset, vault.corridorAsset],
    token: vault.address,
    poolMeta: 'Epoch-based deposits and withdrawals',
    url: `${APP_URL}/s/vaults/${CHAINS[chain].chainId}/${vault.address}`,
  };
};

const isReadable = (v) =>
  v.paused === false &&
  v.totalAssets != null &&
  v.totalSupply != null &&
  v.settlementAsset &&
  v.corridorAsset &&
  v.settlementDecimals != null &&
  v.corridorDecimals != null &&
  v.freeSettlement != null &&
  v.freeCorridor != null;

const chainPools = async (chain, listings) => {
  const fromLogs = await discoverFromLogs(chain);
  const candidates = [...new Set([...fromLogs, ...listedOn(listings, chain)])];
  if (!candidates.length) return [];

  const vaultAddresses = await keepFactoryVaults(chain, candidates);
  if (!vaultAddresses.length) return [];

  const vaults = (await readVaults(chain, vaultAddresses)).filter(isReadable);
  if (!vaults.length) return [];

  const tokens = [
    ...new Set(
      vaults.flatMap((v) => [lower(v.settlementAsset), lower(v.corridorAsset)])
    ),
  ];
  const [tokenInfo, priorPrices] = await Promise.all([
    fetchTokenInfo(chain, tokens),
    readPriorSharePrices(
      chain,
      vaults.map((v) => v.address)
    ),
  ]);

  return vaults
    .map((vault, i) => {
      const settlement = tokenInfo[lower(vault.settlementAsset)];
      const corridor = tokenInfo[lower(vault.corridorAsset)];
      if (!settlement?.price || !settlement.symbol || !corridor?.symbol)
        return null;
      return toPool(chain, vault, settlement, corridor, priorPrices[i]);
    })
    .filter(Boolean);
};

const apy = async () => {
  const listings = await fetchListings();
  const pools = await Promise.all(
    Object.keys(CHAINS).map((chain) => chainPools(chain, listings))
  );
  return pools.flat().filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8322',
  timetravel: false,
  apy,
  url: `${APP_URL}/s/vaults`,
};
