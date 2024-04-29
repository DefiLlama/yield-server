const {
  formatChain,
  formatSymbol,
  getData,
  removeDuplicates,
} = require('../utils');

const vaultsURL = `https://api2.dyson.money/vaults/compounders`;
const appURL = 'https://app.dyson.money/all'

const dysonToLlama = {
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  kava: 'kava',
  avalanche: 'avalanche',
  base: 'base',
};

const main = async () => {
  try {
    const vaults = await getData(vaultsURL);

    const formatted = vaults
      .map((vault) => {
        try {
          /** check if vault is valid */
          if (!vault) {
            console.debug(`empty vault`);
            return null;
          }

          // deconstruct vault object
          const {
            id,
            address: vaultAddress,
            underlying,
            platform,
            composition,
            network: dysonNetwork,
            metrics,
          } = vault;

          /**
           * NETWORK
           */
          const network = dysonToLlama[dysonNetwork];
          if (!network) {
            const networkOptions = Object.keys(dysonToLlama).join(', ');
            console.debug(
              `Ignore vault ${id}, not valid network. Current options ${networkOptions}`
            );
            return null;
          }

          /**
           * UNDERLYING
           */
          const underlyingTokens = underlying
            .sort((a, b) => a.index - b.index)
            .map((token) => token.address);

          /** check if underlying tokens are valid */
          if (!underlyingTokens || underlyingTokens.length === 0) {
            console.debug(`Ignore vault ${id}, no underlying tokens`);
          }

          /**
           * SYMBOL
           */
          const symbols = composition
            .sort((a, b) => a.index - b.index)
            .map((token) => token.symbol);

          /** check if symbols are valid */
          if (!symbols || symbols.length === 0) {
            console.debug(`Ignore vault ${id}, no symbols`);
          }

          /**
           * TVL & APY
           */
          // deconstruct metrics object
          const { tvl: tvlMetric, rewardRate: rewardRateMetric } = metrics;

          // format tvl & apy
          const tvlUsd = Number(tvlMetric.vault.USDBalance);
          const apy = Number(rewardRateMetric.rewardRate) * 100; // apy post performance fees

          /** check if TVL & APY is valid */
          if (!tvlUsd || !apy) {
            console.debug(`Ignore vault ${id}, no TVL or apy`);
            return null;
          }

          return {
            pool: `${vaultAddress}-${network}`.toLowerCase(),
            chain: formatChain(network),
            project: 'dyson',
            symbol: formatSymbol(symbols.join('-')),
            tvlUsd,
            apy,
            poolMeta: formatChain(platform), // provide base platform
            underlyingTokens,
            url: `${appURL}?id=${encodeURIComponent(id)}` // replace special characters with browser safe characted for exceptions like: USD+,USDC+, etc.
          };
        } catch (e) {
          console.debug(e);
          return null;
        }
      })
      // remove any failed vaults
      .filter((vault) => vault !== null);

    return removeDuplicates(formatted);
  } catch (e) {
    console.error(e);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.dyson.money/all',
};
