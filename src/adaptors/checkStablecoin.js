const checkStablecoin = (el, stablecoins) => {
  let tokens = el.symbol.split('-').map((el) => el.toLowerCase());
  const symbolLC = el.symbol.toLowerCase();

  let stable;
  if (
    el.project === 'curve' &&
    symbolLC.includes('3crv') &&
    !symbolLC.includes('btc')
  ) {
    stable = true;
  } else if (el.project === 'curve-dex' && symbolLC.includes('xstable')) {
    stable = true;
  } else if (el.project === 'convex-finance' && symbolLC.includes('3crv')) {
    stable = true;
  } else if (el.project === 'aave-v2' && symbolLC.includes('amm')) {
    tok = tokens[0].split('weth');
    stable = tok[0].includes('wbtc') ? false : tok.length > 1 ? false : true;
  } else if (tokens[0].includes('torn')) {
    stable = false;
  } else if (el.project === 'hermes-protocol' && symbolLC.includes('maia')) {
    stable = false;
  } else if (el.project === 'sideshift' && symbolLC.includes('xai')) {
    stable = false;
  } else if (el.project === 'archimedes-finance' && symbolLC.includes('usd')) {
    stable = true;
  } else if (el.project === 'strata-markets') {
    stable = true;
  } else if (
    el.project === 'aura' &&
    [
      '0xa13a9247ea42d743238089903570127dda72fe44',
      '0x99c88ad7dc566616548adde8ed3effa730eb6c34',
      '0xf3aeb3abba741f0eece8a1b1d2f11b85899951cb',
    ].includes(el.pool)
  ) {
    stable = true;
  } else if (
    tokens.some((t) => t.includes('sushi')) ||
    tokens.some((t) => t.includes('dusk')) ||
    tokens.some((t) => t.includes('fpis')) ||
    tokens.some((t) => t.includes('emaid')) ||
    tokens.some((t) => t.includes('grail')) ||
    tokens.some((t) => t.includes('oxai')) ||
    tokens.some((t) => t.includes('crv') && !t.includes('crvusd')) ||
    tokens.some((t) => t.includes('wbai')) ||
    tokens.some((t) => t.includes('move'))
  ) {
    stable = false;
  } else if (tokens.length === 1) {
    const tokenClean = tokens[0].replace(/\s*\(.*?\)\s*/g, '');
    stable = stablecoins.some((x) => {
      if (!x || x.trim().length === 0) return false;
      if (x.length === 1) {
        return tokenClean === x;
      }
      return tokenClean.includes(x);
    });
  } else if (tokens.length > 1) {
    let x = 0;
    for (const t of tokens) {
      const tokenClean = t.replace(/\s*\(.*?\)\s*/g, '');
      x += stablecoins.some((sc) => {
        if (!sc || sc.trim().length === 0) return false;
        if (sc.length === 1) {
          return tokenClean === sc;
        }
        return tokenClean.includes(sc);
      });
    }
    stable = x === tokens.length;
  }

  return stable;
};

const DEPEG_THRESHOLD = 0.95;

// flags pools whose underlying stablecoin trades materially below peg (downside only,
// so non-usd stables priced in usd ~1.08 don't false-positive). reuses the same token
// matching as checkStablecoin, preferring the most specific (longest) symbol match.
const checkDepeg = (el, stablecoinPrices, threshold = DEPEG_THRESHOLD) => {
  const tokens = el.symbol.split('-').map((t) => t.toLowerCase());

  return tokens.some((t) => {
    const tokenClean = t.replace(/\s*\(.*?\)\s*/g, '');
    let best = null;
    for (const [sym, price] of Object.entries(stablecoinPrices)) {
      if (!sym || sym.trim().length === 0) continue;
      const match =
        sym.length === 1 ? tokenClean === sym : tokenClean.includes(sym);
      if (match && (best === null || sym.length > best.sym.length)) {
        best = { sym, price };
      }
    }
    return best !== null && Number.isFinite(best.price) && best.price < threshold;
  });
};

module.exports = { checkStablecoin, checkDepeg, DEPEG_THRESHOLD };
