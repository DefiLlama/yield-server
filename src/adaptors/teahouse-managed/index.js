const {topLvl} = require("./utils");


const main = async (timestamp = null) => {
    const data = await topLvl(timestamp)
    return data;
};

module.exports = {
  protocolId: '3285',
    timetravel: false,
    apy: main,
};
