const axios = require('axios');
const { getTotalSupply } = require('../utils');

const KYSOL_MINT = 'kySo1nETpsZE2NWe5vj2C64mPSciH1SppmHb4XieQ7B';
const KYJTO_MINT = 'kyJtowDDACsJDm2jr3VZdpCA6pZcKAaNftQwrJ8KBQP';
const JITOSOL = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const JTO = 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL';

const pools = [
  { mint: KYSOL_MINT, symbol: 'kySOL', apyKey: 'sol', underlying: JITOSOL },
  { mint: KYJTO_MINT, symbol: 'kyJTO', apyKey: 'jto', underlying: JTO },
];

const apy = async () => {
  const priceKeys = pools.map((p) => `solana:${p.mint}`).join(',');

  const [priceRes, apyRes, ...supplies] = await Promise.all([
    axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`),
    axios.get('https://api.kyros.fi/kyros/apy'),
    ...pools.map((p) => getTotalSupply(p.mint)),
  ]);

  return pools
    .map((pool, i) => {
      const key = `solana:${pool.mint}`;
      const price = priceRes.data.coins[key]?.price;
      if (!price) return null;

      const apyRaw = apyRes.data[pool.apyKey];
      if (!Number.isFinite(apyRaw)) return null;

      return {
        pool: pool.mint,
        chain: 'Solana',
        project: 'kyros',
        symbol: pool.symbol,
        tvlUsd: supplies[i] * price,
        apyBase: apyRaw * 100,
        underlyingTokens: [pool.underlying],
        token: pool.mint,
      };
    })
    .filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.kyros.fi/',
};
