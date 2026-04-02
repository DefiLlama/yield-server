const axios = require('axios');
const utils = require('../utils');
const { getTotalSupply } = require('../utils');

const WYLDS_MINT = '8fr7WGTVFszfyNWRMXj6fRjZZAnDwmXwEpCrtzmUkdih';
const PRIME_MINT = '3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7';
const PRIME_VAULT = 'FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const POR_URL = 'https://hastra.io/hastra-pulse/public/api/v1/por';

const getTokenAccountBalance = async (account) => {
  const res = await axios.post(SOL_RPC, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountBalance',
    params: [account],
  });
  const { amount, decimals } = res.data.result.value;
  return Number(amount) / Math.pow(10, decimals);
};

const apy = async () => {
  const [porResponse, priceResponse, wyldsSupply, vaultedWylds] =
    await Promise.all([
      axios.get(POR_URL),
      axios.get(
        `https://coins.llama.fi/prices/current/solana:${WYLDS_MINT}`
      ),
      getTotalSupply(WYLDS_MINT),
      getTokenAccountBalance(PRIME_VAULT),
    ]);

  const { wylds_card, demo_prime_card } = porResponse.data;

  const wyldsPrice =
    priceResponse.data.coins[`solana:${WYLDS_MINT}`]?.price ?? 1;

  const wyldsTvl = (wyldsSupply - vaultedWylds) * wyldsPrice;
  const primeTvl = vaultedWylds * wyldsPrice;

  return [
    {
      pool: `${WYLDS_MINT}-solana`,
      chain: utils.formatChain('solana'),
      project: 'hastra',
      symbol: 'wYLDS',
      tvlUsd: wyldsTvl,
      apyBase: Number(wylds_card.current_rate),
      underlyingTokens: [WYLDS_MINT],
    },
    {
      pool: `${PRIME_MINT}-solana`,
      chain: utils.formatChain('solana'),
      project: 'hastra',
      symbol: 'PRIME',
      tvlUsd: primeTvl,
      apyBase: Number(demo_prime_card.current_rate),
      underlyingTokens: [WYLDS_MINT],
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://hastra.io',
};
