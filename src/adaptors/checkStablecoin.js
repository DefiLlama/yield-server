const checkStablecoin = (el, stablecoins) => {
  let tokens = el.symbol.split('-').map((el) => el.toLowerCase());
  const symbolLC = el.symbol.toLowerCase();

  // tokens that merely CONTAIN a stablecoin symbol substring but are NOT stablecoins.
  // e.g. 'pufeth'.includes('feth') or 'lanternsol'.includes('ern') otherwise flag these
  // volatile assets (restaked ETH, a SOL LST, TRON SUN) as stablecoin: true.
  const notStable = ['pufeth', 'lanternsol', 'sunold'];
  if (tokens.some((t) => notStable.includes(t.replace(/\s*\(.*?\)\s*/g, ''))))
    return false;

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

module.exports = { checkStablecoin };
