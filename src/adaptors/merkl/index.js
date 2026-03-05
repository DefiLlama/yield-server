const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { networks } = require('./config');

// Protocols that should not be listed under Merkl
// as they already have their own adapters.
const protocolsBlacklist = [
  'euler',
  'crosscurve',
  'aerodrome',
  'gamma',
  'uniswap',
];

// Allow specific pools from blacklisted protocols
const poolsWhitelist = [
  // Pool from Aerodrome CL: xPufETH-WETH
  '0xCDf927C0F7b81b146C0C9e9323eb5A28D1BFA183',
];

async function getRateAngle(token) {
  const prices = await utils.getData('https://api.angle.money/v1/prices/');
  const price = prices.filter((p) => p.token == token)[0]?.rate;
  return price;
}

function cleanSymbol(symbol) {
  if (!symbol) return '';

  // Patterns to strip from the beginning of symbols
  // Aave tokens: aEth, aArb, aBsc, aOpt, aPol, aAva, aGno, etc.
  // Variable debt: variableDebtEth, variableDebtArb, etc.
  // Stable debt: stableDebtEth, stableDebtArb, etc.
  // Horizon market: variableDebtHorRwa, aHorRwa
  // Other prefixes: steak, gt, vbgt
  const prefixPatterns = [
    /^variableDebt[A-Z][a-z]*(?:Rwa)?/i,  // variableDebtEth, variableDebtHorRwa, etc.
    /^stableDebt[A-Z][a-z]*(?:Rwa)?/i,    // stableDebtEth, stableDebtHorRwa, etc.
    /^a[A-Z][a-z]+(?:Rwa)?(?=[A-Z])/,     // aEth, aArb, aBsc, aHorRwa (followed by uppercase = token name)
//    /^steak(?=[A-Z])/i,                    // steakUSDC -> USDC
//    /^gt(?=[A-Z])/i,                       // gtWETH -> WETH
//    /^vbgt(?=[A-Z])/i,                     // vbgtWETH -> WETH
  ];

  for (const pattern of prefixPatterns) {
    if (pattern.test(symbol)) {
      return symbol.replace(pattern, '');
    }
  }

  return symbol;
}

function getUnderlyingTokens(pool) {
  const tokens = pool.tokens || [];
  if (tokens.length <= 1) return tokens.map((t) => t.address);

  const breakdowns = pool.tvlRecord?.breakdowns || [];
  if (breakdowns.length > 0) {
    const breakdownIds = new Set(breakdowns.map((b) => String(b.identifier)));

    // Match by token ID first
    let matched = tokens.filter((t) => breakdownIds.has(String(t.id)));

    // Fallback: match by address (CLAMM pools use addresses as identifiers)
    if (matched.length === 0) {
      const breakdownAddrs = new Set(
        breakdowns.map((b) => String(b.identifier).toLowerCase())
      );
      matched = tokens.filter((t) =>
        breakdownAddrs.has(t.address.toLowerCase())
      );
    }

    if (matched.length > 0) {
      // If all matched tokens are unverified (receipt/debt) but verified exist, prefer verified
      const allUnverified = matched.every((t) => !t.verified);
      const verified = tokens.filter((t) => t.verified);
      if (allUnverified && verified.length > 0)
        return verified.map((t) => t.address);
      return matched.map((t) => t.address);
    }

    // Breakdowns existed but didn't match any tokens
    // (e.g. gauge pools where breakdown tracks LP token, not components)
    return tokens.map((t) => t.address);
  }

  // No breakdowns at all - use verified filter as last resort
  const verified = tokens.filter((t) => t.verified);
  return verified.length > 0
    ? verified.map((t) => t.address)
    : tokens.map((t) => t.address);
}

// function getting all the data from the Angle API
const main = async () => {
  var poolsData = [];

  const project = 'merkl';

  for (const chainId of Object.keys(networks)) {
    const chain = networks[chainId];

    let pools = [];
    let pageI = 0;

    while (true) {
      let data;
      try {
        data = await utils.getData(
          `https://api.merkl.xyz/v4/opportunities?chainId=${chainId}&status=LIVE&items=100&page=${pageI}`
        );
      } catch (err) {
        console.log('failed to fetch Merkl data on chain ' + chain);
        break;
      }

      if (data.length === 0) {
        break;
      }

      pools.push(...data);
      pageI++;
    }

    for (const pool of pools.filter(
      (x) =>
        !x.protocol ||
        !protocolsBlacklist.includes(x.protocol.id) ||
        poolsWhitelist.includes(x.identifier)
    )) {
      try {
        const poolAddress = pool.identifier;

        const tokenSymbols = pool.tokens.map((x) => x.symbol);
        let symbol = cleanSymbol(tokenSymbols[tokenSymbols.length - 1]) || '';

        if (!symbol.length) {
          symbol = (
            await sdk.api.abi.call({
              target: pool.depositUrl.split('/').slice(-1)[0],
              chain,
              abi: 'erc20:symbol',
            })
          ).output;
        }

        let underlyingTokens = getUnderlyingTokens(pool);

        // For ERC-4626 vault pools where the only underlying is the vault itself,
        // resolve to the actual asset via on-chain asset()
        if (underlyingTokens.length === 1 && underlyingTokens[0].toLowerCase() === poolAddress.toLowerCase()) {
          try {
            const result = await sdk.api.abi.call({
              target: poolAddress,
              chain,
              abi: 'address:asset',
            });
            if (result.output) underlyingTokens = [result.output];
          } catch {}
        }

        // For Aave-type borrow pools, token list may only contain aTokens/debtTokens
        // Resolve to actual underlying asset via on-chain UNDERLYING_ASSET_ADDRESS()
        if (pool.type === 'AAVE_NET_BORROWING' && underlyingTokens.length > 0) {
          try {
            const resolved = await Promise.all(
              underlyingTokens.map(async (addr) => {
                try {
                  const result = await sdk.api.abi.call({
                    target: addr,
                    chain,
                    abi: 'address:UNDERLYING_ASSET_ADDRESS',
                  });
                  return result.output;
                } catch {
                  return addr;
                }
              })
            );
            underlyingTokens = [...new Set(resolved)];
          } catch {}
        }

        const tvlUsd = pool.tvl;

        const rewardTokens =
          pool.rewardsRecord?.breakdowns.map((x) => x.token.address) || [];
        const apyReward = pool.apr;

        const action = pool.action || null;
        const firstToken = tokenSymbols[0] || null;
        const vaultName = (tokenSymbols.length > 1 && firstToken !== symbol) ? firstToken : null;
        const poolMetaParts = [action, vaultName].filter(Boolean);
        const poolMeta = poolMetaParts.length > 0 ? poolMetaParts.join(' - ') : null;

        const poolType = pool.type || 'UNKNOWN';
        const merklChain = chain === 'avax' ? 'avalanche' : chain;
        const poolUrl = `https://app.merkl.xyz/opportunities/${merklChain}/${poolType}/${poolAddress}`;

        const poolData = {
          pool: `${poolAddress}-merkl`,
          chain: chain,
          project: project,
          poolMeta: poolMeta,
          symbol: symbol,
          tvlUsd: tvlUsd ?? 0,
          apyReward: apyReward ?? 0,
          rewardTokens: [...new Set(rewardTokens)],
          underlyingTokens: underlyingTokens,
          url: poolUrl,
        };
        poolsData.push(poolData);
      } catch {}
    }
  }
  return utils.removeDuplicates(poolsData.filter((p) => utils.keepFinite(p)));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.merkl.xyz/',
};
