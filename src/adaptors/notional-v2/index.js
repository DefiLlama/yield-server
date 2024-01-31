const utils = require('../utils');
const main = async () => {
  let data = await utils.getData(
    'https://classic.notional.finance/.netlify/functions/yields'
  );
  data = data.map((p) => {
    const name = p.symbol.split(' ');
    return {
      ...p,
      project: 'notional-v2',
      pool: `${p.symbol.replace(/\s/g, '-')}-notional`,
      symbol: name[0],
      poolMeta: name.length > 1 ? name.slice(1).join(' ') : null,
      url: `https://www.notional.finance/lend/${name}`,
    };
  });

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
