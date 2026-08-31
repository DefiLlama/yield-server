const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'guru-network-classic'
const wrappers = [
  {
    address: '0x5b8ce6d591c914a56cb019b3decb63ede22708c8',
    symbol: 'stakeTHENA',
    underlyingToken: '0xafbe3b8b0939a5538de32f7752a78e08c8492295',
    underlyingChain: 'bsc',
    poolUrl: 'https://eliteness.network/ethena/vault'
  },
];

const main = async (timestamp = null) => {
  const evaluatedTimestamp =
    timestamp == null ? Math.floor(Date.now() / 1000) : Number(timestamp);
  const priceKeys = wrappers
    .map((w) => `${w.underlyingChain}:${w.underlyingToken}`)
    .join(',');
  const data = await utils.getPriceApiData(
    timestamp == null
      ? `/prices/current/${priceKeys}`
      : `/prices/historical/${evaluatedTimestamp}/${priceKeys}`
  );
  const prices = data?.coins ?? {};
   const infos = await Promise.all(
     wrappers.map((w) => utils.getERC4626Info(w.address, w.underlyingChain, evaluatedTimestamp))
   );
  return Promise.all(infos
    .map(async (info, i) => {
     const token = `${wrappers[i].underlyingChain}:${wrappers[i].underlyingToken}`;
    let priceEntry = prices[token];
    if (!priceEntry || priceEntry.price == null || priceEntry.decimals == null) {
      // eTHENA is no longer priced by the coins API. Use the vault's live
      // USD price view, also used by its frontend (18-decimal USD units).
      const w = wrappers[i];
      const [block] = await utils.getBlocksByTime(
        [evaluatedTimestamp],
        w.underlyingChain
      );
      const [price, decimals] = await Promise.all([
        sdk.api.abi.call({
          target: w.address,
          chain: w.underlyingChain,
          block,
          abi: 'function getAssetPriceUSD(address) view returns (uint256)',
          params: [w.underlyingToken],
        }),
        sdk.api.abi.call({
          target: w.underlyingToken,
          chain: w.underlyingChain,
          abi: 'erc20:decimals',
        }),
      ]);
      priceEntry = {
        price: Number(price.output) / 1e18,
        decimals: Number(decimals.output),
      };
    }
    if (!Number.isFinite(priceEntry.price) || priceEntry.price <= 0)
      throw new Error(`guru-network-classic: missing price for ${token}`);
     return {
       pool: info.pool,
       chain: wrappers[i].underlyingChain,
       project: PROJECT,
       symbol: wrappers[i].symbol,
      tvlUsd: (Number(info.tvl) / 10 ** priceEntry.decimals) * priceEntry.price,
       apyBase: info.apyBase,
       pricePerShare: info.pricePerShare,
       underlyingTokens: [wrappers[i].underlyingToken],
       url: wrappers[i].poolUrl
     };
  }));
 };

module.exports = {
  protocolId: '1299',
  timetravel: true,
  apy: main,
  // url: 'https://example.com/pools', // Link to page with pools (Only required if you do not provide url's for each pool),
};
