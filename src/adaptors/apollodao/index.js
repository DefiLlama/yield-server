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
          url: `https://api.apollo.farm/api/graph?query=query+MyQuery+%7B%0A++vaults%28label%3A+%22${encodeURIComponent(
            v.label
          )}%22%29+%7B%0A++++label%0A++++contract_address%0A++++apr_tvl%28limit%3A+1%29+%7B%0A++++++apr+%7B%0A++++++++aprs+%7B%0A++++++++++type%0A++++++++++value%0A++++++++%7D%0A++++++++fees+%7B%0A++++++++++type%0A++++++++++value%0A++++++++%7D%0A++++++%7D%0A++++++tvl+%7B%0A++++++++info+%7B%0A++++++++++type%0A++++++++++value%0A++++++++%7D%0A++++++++amount%0A++++++%7D%0A++++%7D%0A++%7D%0A++tokens%28network%3A+${chain[1].replaceAll(
            '-',
            '_'
          )}%2C+label%3A+%22${encodeURIComponent(
            vault_token.name
          )}%22%29+%7B%0A++++label%0A++++asset+%7B%0A++++++type%0A++++++value%0A++++%7D%0A++++symbol%0A++++decimals%0A++++prices%28limit%3A+1%29+%7B%0A++++++price%0A++++%7D%0A++%7D%0A%7D`,
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
