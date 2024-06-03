const sdk = require('@defillama/sdk');
const { getProvider } = require('@defillama/sdk/build/general');
const ethers = require('ethers');
const axios = require('axios');

const addressBook = {
  polygon: {
    usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    eTokens: [
      // eTokens
      {name: "eToken Junior Koala", address: "0x8d2Ee82c4172B2138B06b8037d769cBfAf9C0274", symbol: "eUSDJrKo"},
      {name: "eToken Senior", address: "0x55bAe6690d46EA94D7F05DF7c80A85E322421fB6", symbol: "eUSDSr"},
      {name: "eToken Innov Zone", address: "0x1C48Accaf6f8106883AA1973A45F02525652DEfC", symbol: "eUSDJrIZ"},
      // Commenting out these two pools, since they aren't open to the general public for now
      // {name: "eToken Junior Koala BMA", address: "0xBC33c283A37d46ABA17BC5F8C27b27242688DeC6", symbol: "eUSDJrKoBMA"},
      // {name: "eToken Senior BMA", address: "0xF383eF2D31E1d4a19B3e04ca2937DB6A8DA9f229", symbol: "eUSDSrBMA"},
    ],
  }
};

const abiTransfer = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

const getApy = async () => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/polygon/${timestamp1dayAgo}`)
  ).data.height;

  const provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_POLYGON);

  return await Promise.all(addressBook.polygon.eTokens.map(async (etk) => {
    const [tsNow, tsOneDayAgo] = await Promise.all([
      sdk.api.erc20.totalSupply({ target: etk.address, chain: "polygon" }),
      sdk.api.erc20.totalSupply({ target: etk.address, chain: "polygon", block: block1dayAgo }),
    ]);

    const contract = new ethers.Contract(etk.address, abiTransfer, provider);
    const transfers = await contract.queryFilter(contract.filters.Transfer(), block1dayAgo);
    const netDeposits = transfers.filter((evt) => (
      evt.args.from === ethers.constants.AddressZero || 
      evt.args.to === ethers.constants.AddressZero
    )).reduce((accumulator, evt) => (
      evt.args.from === ethers.constants.AddressZero ? 
        accumulator.add(evt.args.value) : 
        accumulator.sub(evt.args.value)
    ), ethers.BigNumber.from(0)).toNumber();
    console.log(netDeposits);
    console.log(tsNow.output);
    const dailyApr = (tsNow.output - tsOneDayAgo.output - netDeposits) / tsOneDayAgo.output;
    // Using apr to apy formula from https://www.aprtoapy.com/
    const apy = (Math.pow(1 + dailyApr, 365) - 1) * 100;
    return {
      pool: etk.address,
      chain: 'polygon',
      project: 'ensuro',
      symbol: etk.symbol,
      tvlUsd: tsNow.output / 1e6,
      apyBase: apy,
      url: `https://app.ensuro.co/eTokens/${etk.address}`,
      underlyingTokens: [addressBook.polygon.usdc],
    };
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
