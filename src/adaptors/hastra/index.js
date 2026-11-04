const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const POR_URL = 'https://hastra.io/hastra-pulse/public/api/v1/por';
const EFFECTIVE_RATE_URL =
  'https://hastra.io/hastra-pulse/public/api/v1/reports/nav/effective-int-rate';

const WYLDS = {
  solana: '8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih',
  ethereum: '0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc',
};

// PRIME and AUTO stake wYLDS into Democratized Prime lending pools -- HELOC+ loans and consumer
// auto loans respectively -- and share one global NAV. Each declares where its rate comes from:
// `ethereum` measures the ERC4626 ratio directly, `rateToken` reads the same NAV measure from
// Hastra's report because AUTO has not launched on Ethereum and Solana exposes no historical
// account state. A wrapper with neither gets no pool, but stays listed so the wYLDS it holds is
// still excluded from the wYLDS pool.
const VAULTS = [
  {
    symbol: 'PRIME',
    url: 'https://hastra.io/prime',
    ethereum: '0x19ebb35279A16207Ec4ba82799CC64715065F7F6',
    solanaMint: '3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7',
    solanaVault: 'FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3',
  },
  {
    symbol: 'AUTO',
    url: 'https://hastra.io/auto',
    rateToken: 'auto-mint',
    solanaMint: 'GNE6oDS6jHrfaV3GQVVCCp37fDnT7PiPuewMKBj2bqNm',
    solanaVault: 'GtWPVP3KPTJC8z9wPLAop4mPp9jZiRKzL8deDD4PfQ7C',
  },
];

const ETHEREUM_VAULTS = VAULTS.filter((v) => v.ethereum);
const RATED_VAULTS = VAULTS.filter((v) => v.ethereum || v.rateToken);

const WYLDS_URL = 'https://hastra.io/wylds';

const CONVERT_TO_ASSETS =
  'function convertToAssets(uint256 shares) view returns (uint256)';
// wYLDS and both wrappers are 6 decimals.
const ONE_SHARE = '1000000';
const WINDOW_DAYS = 7;
const DAY_SECONDS = 86400;

// SPL Token layouts: a mint holds supply at 36 and decimals at 44, a token account its amount
// at 64.
const MINT_SUPPLY_OFFSET = 36;
const MINT_DECIMALS_OFFSET = 44;
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;

const solanaAccounts = async (addresses) => {
  const res = await axios.post(SOL_RPC, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getMultipleAccounts',
    params: [addresses, { encoding: 'base64', commitment: 'confirmed' }],
  });
  if (res.data.error) {
    throw new Error(`Error fetching Solana accounts: ${res.data.error.message}`);
  }
  return res.data.result.value.map((account, i) => {
    if (!account) throw new Error(`Missing Solana account ${addresses[i]}`);
    return Buffer.from(account.data[0], 'base64');
  });
};

const wyldsPerShareAt = async (target, block) => {
  const { output } = await sdk.api.abi.call({
    chain: 'ethereum',
    target,
    abi: CONVERT_TO_ASSETS,
    params: [ONE_SHARE],
    block,
  });
  return Number(output);
};

// wYLDS redeems 1:1 for USDC and its own yield arrives as extra tokens rather than in its ratio,
// so a wrapper's wYLDS-per-share growth is its realised USD yield, net of the 50bps Hastra fee.
const navApy = async (target, blockNow, blockThen) => {
  const [rateNow, rateThen] = await Promise.all([
    wyldsPerShareAt(target, blockNow),
    wyldsPerShareAt(target, blockThen),
  ]);

  if (!(rateThen > 0)) return null;

  const ratio = rateNow / rateThen;
  if (!(ratio >= 1)) return null;

  return (ratio ** (365 / WINDOW_DAYS) - 1) * 100;
};

// The same NAV measure, as Hastra publishes it, over their trailing 24h rather than a window of
// our choosing -- so it moves around more than the on-chain reading.
const publishedNavApy = async (rateToken) => {
  const { data } = await axios.get(
    `${EFFECTIVE_RATE_URL}?token_name=${rateToken}`
  );
  const apyBase = Number(data.effective_annual_rate_pct);
  return Number.isFinite(apyBase) ? apyBase : null;
};

const vaultApy = (vault, blockNow, blockThen) =>
  vault.ethereum
    ? navApy(vault.ethereum, blockNow, blockThen)
    : publishedNavApy(vault.rateToken);

const erc20 = (target, abi, params, block) =>
  sdk.api.abi
    .call({ chain: 'ethereum', target, abi, params, block })
    .then(({ output }) => Number(output) / 1e6);

const bySymbol = (vaults, values) =>
  Object.fromEntries(vaults.map((v, i) => [v.symbol, values[i]]));

// One request so the supply and every vault balance come from the same slot: the standalone
// wYLDS pool is a small residual of much larger numbers, so read skew would land entirely on it.
const solanaBalances = async () => {
  const [mint, ...vaults] = await solanaAccounts([
    WYLDS.solana,
    ...VAULTS.map((v) => v.solanaVault),
  ]);

  const decimals = mint.readUInt8(MINT_DECIMALS_OFFSET);
  const amount = (account, offset) =>
    Number(account.readBigUInt64LE(offset)) / 10 ** decimals;

  return {
    supply: amount(mint, MINT_SUPPLY_OFFSET),
    vaulted: bySymbol(
      VAULTS,
      vaults.map((v) => amount(v, TOKEN_ACCOUNT_AMOUNT_OFFSET))
    ),
  };
};

const ethereumBalances = async (block) => {
  const [supply, vaulted] = await Promise.all([
    erc20(WYLDS.ethereum, 'erc20:totalSupply', undefined, block),
    Promise.all(
      ETHEREUM_VAULTS.map((v) =>
        erc20(WYLDS.ethereum, 'erc20:balanceOf', [v.ethereum], block)
      )
    ),
  ]);
  return { supply, vaulted: bySymbol(ETHEREUM_VAULTS, vaulted) };
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const then = now - WINDOW_DAYS * DAY_SECONDS;

  const [blockNow, blockThen] = await Promise.all([
    utils.getPriceApiData(`/block/ethereum/${now}`),
    utils.getPriceApiData(`/block/ethereum/${then}`),
  ]);

  const [porResponse, priceResponse, vaultApys, solana, ethereum] =
    await Promise.all([
      axios.get(POR_URL),
      axios.get(
        utils.getPriceApiUrl(
          `/prices/current/solana:${WYLDS.solana},ethereum:${WYLDS.ethereum}`
        )
      ),
      Promise.all(
        RATED_VAULTS.map((v) =>
          vaultApy(v, blockNow.height, blockThen.height)
        )
      ),
      solanaBalances(),
      ethereumBalances(blockNow.height),
    ]);

  const apyBase = bySymbol(RATED_VAULTS, vaultApys);

  const unreadable = RATED_VAULTS.filter(
    (v) => apyBase[v.symbol] === null
  ).map((v) => v.symbol);
  if (unreadable.length) {
    throw new Error(
      `hastra: could not read the NAV rate for ${unreadable.join(', ')}`
    );
  }

  const prices = Object.fromEntries(
    Object.entries(WYLDS).map(([chain, token]) => {
      const price = priceResponse.data.coins[`${chain}:${token}`]?.price;
      if (!price) throw new Error(`Missing price for wYLDS (${chain}:${token})`);
      return [chain, price];
    })
  );

  // Every wrapper's wYLDS sits in the wYLDS supply, so the standalone pool is what is left
  // once each vault's holdings are removed -- including vaults that get no pool of their own.
  const unvaulted = ({ supply, vaulted }) =>
    Math.max(0, Object.values(vaulted).reduce((rest, held) => rest - held, supply));

  const wyldsRate = Number(porResponse.data.wylds_card.current_rate);

  const pools = [
    {
      pool: `${WYLDS.solana}-solana`,
      chain: utils.formatChain('solana'),
      symbol: 'wYLDS',
      tvlUsd: unvaulted(solana) * prices.solana,
      apyBase: wyldsRate,
      underlyingTokens: [WYLDS.solana],
      url: WYLDS_URL,
    },
    {
      pool: `${WYLDS.ethereum.toLowerCase()}-ethereum`,
      chain: utils.formatChain('ethereum'),
      symbol: 'wYLDS',
      tvlUsd: unvaulted(ethereum) * prices.ethereum,
      apyBase: wyldsRate,
      underlyingTokens: [WYLDS.ethereum],
      url: WYLDS_URL,
    },
    ...RATED_VAULTS.map((v) => ({
      pool: `${v.solanaMint}-solana`,
      chain: utils.formatChain('solana'),
      symbol: v.symbol,
      tvlUsd: solana.vaulted[v.symbol] * prices.solana,
      apyBase: apyBase[v.symbol],
      underlyingTokens: [WYLDS.solana],
      url: v.url,
    })),
    ...ETHEREUM_VAULTS.map((v) => ({
      pool: `${v.ethereum.toLowerCase()}-ethereum`,
      chain: utils.formatChain('ethereum'),
      symbol: v.symbol,
      tvlUsd: ethereum.vaulted[v.symbol] * prices.ethereum,
      apyBase: apyBase[v.symbol],
      underlyingTokens: [WYLDS.ethereum],
      url: v.url,
    })),
  ];

  return pools
    .map((p) => ({ ...p, project: 'hastra' }))
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '7266',
  timetravel: false,
  apy,
  url: 'https://hastra.io',
};
