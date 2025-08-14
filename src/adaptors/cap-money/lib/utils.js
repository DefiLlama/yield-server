const { ethers } = require('ethers');

const interpretAsDecimal = (value, decimals) => {
    return ethers.BigNumber.from(value).div(ethers.BigNumber.from(10).pow(decimals));
}

module.exports = {
    interpretAsDecimal,
}