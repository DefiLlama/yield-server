const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { getTotalSupply } = require('../utils');

const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const POR_URL = 'https://hastra.io/hastra-pulse/public/api/v1/por';
const EFFECTIVE_RATE_URL =
  'https://hastra.io/hastra-pulse/public/api/v1/reports/nav/effective-int-rate';

const WYLDS = {
  solana: '8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih',
  ethereum: '0x6aD038cA6C04e885630851278ca0a856Ad9a66Cc',
};

// PRIME and AUTO stake wYLDS into Democratized Prime lending pools -- HELOC+ loans and consumer
// auto loans respectively -- and share one global NAV, so the Ethereum ERC4626 is the rate
// source for the Solana pool as well. AUTO has not launched on Ethereum, so it has no on-chain
// NAV history to read and falls back to the same trailing-NAV measure Hastra publishes.
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

const WYLDS_URL = 'https://hastra.io/wylds';

const CONVERT_TO_ASSETS =
  'function convertToAssets(uint256 shares) view returns (uint256)';
// wYLDS and both wrappers are 6 decimals.
const ONE_SHARE = '1000000';
const WINDOW_DAYS = 7;
const DAY_SECONDS = 86400;

const getTokenAccountBalance = async (account) => {
  const res = await axios.post(SOL_RPC, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountBalance',
    params: [account],
  });
  if (res.data.error) {
    throw new Error(`Error fetching token account balance: ${res.data.error.message}`);
  }
  const { amount, decimals } = res.data.result.value;
  return Number(amount) / Math.pow(10, decimals);
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

// The same NAV measure Hastra's own dashboard reports, over a trailing 24h rather than a window
// we choose.
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

const solanaBalances = async () => ({
  supply: await getTotalSupply(WYLDS.solana),
  vaulted: await Promise.all(
    VAULTS.map((v) => getTokenAccountBalance(v.solanaVault))
  ),
});

// Pinned to one block: the standalone wYLDS pool is a small residual of two much larger
// numbers, so skew between the supply and balance reads would land entirely on it.
const ethereumBalances = async (block) => ({
  supply: await erc20(WYLDS.ethereum, 'erc20:totalSupply', undefined, block),
  vaulted: await Promise.all(
    ETHEREUM_VAULTS.map((v) =>
      erc20(WYLDS.ethereum, 'erc20:balanceOf', [v.ethereum], block)
    )
  ),
});

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
        VAULTS.map((v) => vaultApy(v, blockNow.height, blockThen.height))
      ),
      solanaBalances(),
      ethereumBalances(blockNow.height),
    ]);

  const apyBySymbol = Object.fromEntries(
    VAULTS.map((v, i) => [v.symbol, vaultApys[i]])
  );

  const unreadable = VAULTS.filter((v) => apyBySymbol[v.symbol] === null).map(
    (v) => v.symbol
  );
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
  // once each vault's holdings are removed.
  const unvaulted = ({ supply, vaulted }) =>
    Math.max(0, vaulted.reduce((rest, balance) => rest - balance, supply));

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
    ...VAULTS.map((v, i) => ({
      pool: `${v.solanaMint}-solana`,
      chain: utils.formatChain('solana'),
      symbol: v.symbol,
      tvlUsd: solana.vaulted[i] * prices.solana,
      apyBase: apyBySymbol[v.symbol],
      underlyingTokens: [WYLDS.solana],
      url: v.url,
    })),
    ...ETHEREUM_VAULTS.map((v, i) => ({
      pool: `${v.ethereum.toLowerCase()}-ethereum`,
      chain: utils.formatChain('ethereum'),
      symbol: v.symbol,
      tvlUsd: ethereum.vaulted[i] * prices.ethereum,
      apyBase: apyBySymbol[v.symbol],
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
