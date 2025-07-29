const axios = require('axios');

const main = async () => {
    let pools = (
        await axios.get("https://app.fullsail.finance/api/defi_llama/pools")
    );

    return pools.data;
};

module.exports = {
    apy: main,
};
