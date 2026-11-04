const axios = require('axios');
const utils = require('../utils');

// Exceed Finance yield-bearing tokens on Solana. Each pair account of the
// Exceed liquid program stores the base token, the receipt token mint and the
// on-chain rate schedule that sets the receipt token's exchange rate.
const PROGRAM_ID = 'par1tyqusak2f2DXg9RHv78SVHNWXkJLSbtJZQSuWjV';
const PAIRS = [
  { pair: 'EwqMpnBHKEd537E37kcsNU9Qi82uukjVAXsC8K5Kswt7', symbol: 'USDC', meta: 'exUSDC', slug: 'exUSDC' },
  { pair: 'HwsGQqoXwQjGg5CDojLTipmeYFSmovoHtk7ZFtgrxSop', symbol: 'SOL', meta: 'exSOL', slug: 'exSOL' },
  { pair: 'GpV9U2yY3L5u4DkWC6Unejsz42iNME4Usk5RzTaA23to', symbol: 'CBBTC', meta: 'exBTC', slug: 'exBTC' },
];

const PRECISION = 10n ** 12n;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function toBase58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

function readPair(data) {
  let o = 10; // discriminator + bumps
  const baseMint = toBase58(data.subarray(o, o + 32)); o += 32;
  const baseDecimals = data[o]; o += 1;
  const lstMint = toBase58(data.subarray(o, o + 32)); o += 32;
  const lstDecimals = data[o]; o += 1;
  const symbolLength = data.readUInt32LE(o); o += 4 + symbolLength;
  const intervalRate = data.readBigUInt64LE(o); o += 8;
  const secondsPerInterval = data.readInt32LE(o); o += 4;
  o += 8; // initial exchange rate
  const lastRate = data.readBigUInt64LE(o); o += 8;
  const lastTimestamp = data.readBigInt64LE(o);
  return { baseMint, baseDecimals, lstMint, lstDecimals, intervalRate, secondsPerInterval, lastRate, lastTimestamp };
}

// Same schedule as the program: compounding per full interval, linear within the current one.
function exchangeRate({ intervalRate, secondsPerInterval, lastRate, lastTimestamp }, now) {
  const step = BigInt(secondsPerInterval);
  const elapsed = now - lastTimestamp;
  if (elapsed <= 0n) return lastRate;
  let periods = elapsed / step;
  const remainder = elapsed % step;
  let compounded = PRECISION;
  let factor = intervalRate;
  while (periods > 0n) {
    if (periods & 1n) compounded = (compounded * factor) / PRECISION;
    factor = (factor * factor) / PRECISION;
    periods >>= 1n;
  }
  const linear = ((intervalRate - PRECISION) * remainder) / step;
  return (lastRate * (compounded + linear)) / PRECISION;
}

async function tokenSupply(mint) {
  const { data } = await axios.post(RPC, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenSupply',
    params: [mint],
  });
  if (data.error) throw new Error(`getTokenSupply ${mint}: ${data.error.message}`);
  return BigInt(data.result.value.amount);
}

const apy = async () => {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const pairs = [];
  for (const p of PAIRS) {
    const account = await utils.getSolanaAccount(p.pair, { rpcUrl: RPC });
    if (!account || account.owner !== PROGRAM_ID) {
      throw new Error(`Unexpected owner for pair ${p.pair}`);
    }
    pairs.push({ ...p, ...readPair(account.data) });
  }

  const { pricesByAddress } = await utils.getPrices(pairs.map((p) => p.baseMint), 'solana');

  const pools = [];
  for (const p of pairs) {
    const supply = await tokenSupply(p.lstMint);
    const rate = exchangeRate(p, now);
    const baseAmount = (Number((supply * rate) / PRECISION) / 10 ** p.lstDecimals);
    const price = pricesByAddress[p.baseMint.toLowerCase()];
    if (!price) continue;
    const intervalsPerYear = SECONDS_PER_YEAR / p.secondsPerInterval;
    const apyBase = ((Number(p.intervalRate) / Number(PRECISION)) ** intervalsPerYear - 1) * 100;
    pools.push({
      pool: `${p.lstMint}-solana`,
      chain: 'Solana',
      project: 'exceed-finance',
      symbol: p.symbol,
      tvlUsd: baseAmount * price,
      apyBase,
      pricePerShare: Number(rate) / Number(PRECISION),
      underlyingTokens: [p.baseMint],
      token: p.lstMint,
      poolMeta: p.meta,
      url: `https://app.exceed.finance/vaults/${p.slug}?utm_source=defillama&utm_medium=yields`,
    });
  }
  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '9200',
  timetravel: false,
  apy,
  url: 'https://app.exceed.finance/vaults',
};
