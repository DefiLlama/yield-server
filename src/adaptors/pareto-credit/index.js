const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const FACTORY = '0x59aabDAd8FDaBD227CC71543B128765f93906626';
const FACTORY_START_BLOCK = 22938055;

const LEGACY_VAULTS = [
  '0xf6223C567F21E33e859ED7A045773526E9E3c2D5',
  '0x4462eD748B8F7985A4aC6b538Dfc105Fce2dD165',
  '0x14B8E918848349D1e71e806a52c13D4e0d3246E0',
  '0x433D5B175148dA32Ffe1e1A37a939E1b7e79be4d',
];

// getApr() is gross of the CDO performance fee (fee() / FULL_ALLOC, e.g.
// 10000 / 100000 = 10%), while virtualPrice already nets it. Report the net
// rate. If fee() cannot be read, keep the gross getApr() rather than guess.
const FULL_ALLOC = 100000;
const netApr = (apr, fee) => {
  const gross = apr / 1e18;
  if (fee == null) return gross;
  return gross * (1 - Number(fee) / FULL_ALLOC);
};

const multiCall = async (abi, calls, block) =>
  (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi,
      calls,
      block,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

// Some legacy CDOs (e.g. Fasanara) return getApr() == 0 while their tranche
// price keeps rising. For those, fall back to the realised 30-day growth of
// virtualPrice. 30 days, not 7: tranche prices step once per epoch, so a 7-day
// window often lands between two steps and reads 0 as well.
const FALLBACK_DAYS = 30;

const realisedApr = (priceNow, pricePrior) => {
  if (!priceNow || !pricePrior || Number(pricePrior) <= 0) return null;
  const growth = Number(priceNow) / Number(pricePrior) - 1;
  if (!(growth > 0)) return null;
  return growth * (365 / FALLBACK_DAYS) * 100;
};

const vaultName = (trancheName, tokenSymbol) => {
  if (!trancheName) return undefined;
  let name = trancheName.split(' - ').pop();
  if (tokenSymbol && name.endsWith(tokenSymbol)) {
    name = name.slice(0, -tokenSymbol.length);
  }
  return name.replace(/^idle_/, '').trim();
};

const apy = async () => {
  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const deployEvents = await sdk.getEventLogs({
    chain: CHAIN,
    target: FACTORY,
    eventAbi: 'event CreditVaultDeployed(address proxy)',
    fromBlock: FACTORY_START_BLOCK,
    toBlock: currentBlock.number,
  });

  const vaults = [...LEGACY_VAULTS];
  for (const ev of deployEvents) {
    const proxy = ev.args.proxy;
    if (!vaults.some((v) => v.toLowerCase() === proxy.toLowerCase())) {
      vaults.push(proxy);
    }
  }

  const vaultCalls = vaults.map((target) => ({ target }));
  const [tokens, tranches, contractValues, fees] = await Promise.all([
    multiCall('address:token', vaultCalls),
    multiCall('address:AATranche', vaultCalls),
    multiCall('uint256:getContractValue', vaultCalls),
    multiCall('uint256:fee', vaultCalls),
  ]);

  const [aprs, sharePrices, trancheNames, symbols, decimals] = await Promise.all([
    multiCall(
      'function getApr(address) view returns (uint256)',
      vaults.map((target, i) => ({ target, params: [tranches[i]] }))
    ),
    multiCall(
      'function virtualPrice(address) view returns (uint256)',
      vaults.map((target, i) => ({ target, params: [tranches[i]] }))
    ),
    multiCall('string:name', tranches.map((target) => ({ target }))),
    multiCall('erc20:symbol', tokens.map((target) => ({ target }))),
    multiCall('erc20:decimals', tokens.map((target) => ({ target }))),
  ]);

  // Only fetch past prices for the vaults that need the fallback.
  const zeroAprIdx = vaults
    .map((_, i) => i)
    .filter((i) => tranches[i] && aprs[i] != null && Number(aprs[i]) === 0);
  const fallbackAprs = {};
  if (zeroAprIdx.length) {
    // Optional: if the historical lookup fails, every pool still reports its
    // current getApr() and the zero-APR vaults simply keep 0.
    try {
      const ts = Math.floor(Date.now() / 1000) - 86400 * FALLBACK_DAYS;
      const { height: priorBlock } = await utils.getPriceApiData(
        `/block/${CHAIN}/${ts}`
      );
      const priorPrices = await multiCall(
        'function virtualPrice(address) view returns (uint256)',
        zeroAprIdx.map((i) => ({ target: vaults[i], params: [tranches[i]] })),
        priorBlock
      );
      zeroAprIdx.forEach((i, j) => {
        const apr = realisedApr(sharePrices[i], priorPrices[j]);
        if (apr !== null) fallbackAprs[i] = apr;
      });
    } catch (e) {
      console.log('pareto-credit: 30d virtualPrice fallback skipped', e.message);
    }
  }

  const { pricesByAddress: prices } = await utils.getPrices(
    [...new Set(tokens.filter(Boolean))],
    CHAIN
  );

  const pools = vaults.map((vault, i) => {
    const token = tokens[i];
    const price = prices[token?.toLowerCase()];
    if (!token || !price || !contractValues[i] || !tranches[i]) return null;

    const tvlUsd = (contractValues[i] / 10 ** decimals[i]) * price;

    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'pareto-credit',
      symbol: symbols[i],
      poolMeta: vaultName(trancheNames[i], symbols[i]),
      tvlUsd,
      apyBase: fallbackAprs[i] ?? netApr(aprs[i], fees[i]),
      token: tranches[i].toLowerCase(),
      underlyingTokens: [token],
      pricePerShare: sharePrices[i] / 10 ** decimals[i],
      url: `https://app.pareto.credit/vault#${tranches[i]}`,
    };
  });

  return pools.filter(Boolean).filter((p) => p.tvlUsd > 0 && utils.keepFinite(p));
};

module.exports = {
  protocolId: '6429',
  timetravel: false,
  apy,
  url: 'https://app.pareto.credit/vaults',
};
