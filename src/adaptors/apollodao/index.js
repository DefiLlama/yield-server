const utils = require('../utils');

const chains = { osmosis: 'osmosis-1' };

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const vaults = await utils.getData(
        `https://api.apollo.farm/api/vault_infos/v2/${chain[1]}`
      );

      const tokens = await utils.getData(
        `https://api.apollo.farm/api/tokens/v2/network/${chain[1]}`
      );

      return vaults.map((v) => {
        const vault_token = tokens.find(
          (t) => JSON.stringify(t.asset) === JSON.stringify(v.vault_token)
        );
        const lp_token = tokens.find(
          (t) => JSON.stringify(t.asset) === JSON.stringify(v.tvl.info)
        );
        return {
          pool: `${vault_token.asset.native}-${chain[0]}`,
          chain: utils.formatChain(chain[0]),
          project: 'apollodao',
          symbol: utils.formatSymbol(`${v.label.split(' ')[0]}-VT`),
          tvlUsd:
            (v.tvl.amount / Math.pow(10, lp_token.decimals)) * lp_token.price,
          apy: formatApyBreakdown(v.apr) * 100,
          rewardTokens: [
            ...new Set(
              v.apr.aprs
                .filter((a) => a.type !== 'Swap Fee')
                .map(
                  (a) => tokens.find((t) => t.symbol === a.type).asset.native
                )
            ),
          ],
          underlyingTokens: [v.tvl.info.native],
          url: `https://apollo.farm`,
        };
      });
    })
  );

  return data.flat().filter((p) => utils.keepFinite(p));
};

const formatApyBreakdown = (apr) => {
  const baseApr = apr.aprs.reduce((acc, apr) => {
    return acc + apr.value;
  }, 0);
  const fees = apr.fees.reduce((acc, fee) => {
    return acc + fee.value;
  }, 0);
  const totalApr = baseApr - fees;
  const apy = aprToApy(totalApr);
  return apy;
};

const aprToApy = (apr) => {
  return apr <= 0 ? 0 : Math.pow(1 + apr / 365, 365) - 1;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
