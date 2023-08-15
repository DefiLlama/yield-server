const {topLvl} = require("./utils");


const main = async (timestamp = null) => {
    const data = await topLvl(timestamp)
    return data;
};

module.exports = {
    timetravel: false,
    apy: main,
};
