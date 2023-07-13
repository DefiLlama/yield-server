const utils = require('../utils');

const axios = require('axios');

const { getTotaldETHMinted } = require('./subgraph');
const { ethers } = require('ethers');

const topLvl = async (chainString, url, token, address, underlying) => {
  let dataApy;
  let data;

  if (chainString === 'ethereum') {
    dataApy = await utils.getData(`${url}/indexAPRAverage?index=0`);
    dataApy.apr = dataApy.allIndexAPRAverage;
    data = { ...dataApy };
  }
  data.token = token;
  data.address = address;
	
  let totaldETH = await Promise.all([
      getTotaldETHMinted()
  ]);
   
  let total = ethers.BigNumber.from(0);

  totaldETH[0].stakeHouses.forEach((stakeHouse) => {
    total = total.add(ethers.BigNumber.from(stakeHouse.dETHMintedWithinHouse));
  });

  const totalEthMinted = ethers.utils.formatEther(total);
  const ethUSDPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:0x0000000000000000000000000000000000000000`)
  ).data;

  console.log("Total dETH minted:");
  console.log(totalEthMinted);

  console.log("ETH/USD price: ");
  console.log(ethUSDPrice);
  //console.log(ethUSDPrice.coins);
  ethUsd = ethUSDPrice.coins['ethereum:0x0000000000000000000000000000000000000000'].price;

  console.log(ethUSDPrice.coins['ethereum:0x0000000000000000000000000000000000000000'].price);
  //console.log(ethUSDPrice.coins[0]);
  //console.log(ethUSDPrice.coins[0].ethereum.price);
  //console.log(ethUSDPrice.coins[0].ethereum[0]);

  console.log("Underlying price:");
  console.log(ethUSDPrice);
  console.log("Underlying price * dETH minted:");
  console.log(totalEthMinted*ethUsd);

  return {
	pool: `${data.address}`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'stakehouse',
    symbol: utils.formatSymbol(data.token),
	tvlUsd: totalEthMinted*ethUsd,
    apyBase: Number(data.apr),
    underlyingTokens: [underlying],
  };
};



const main = async () => {
  const data = await Promise.all([
    topLvl(
      'ethereum',
      'https://kyd9gxliq3.execute-api.eu-central-1.amazonaws.com/mainnet',
      'dETH',
      '0x3d1E5Cf16077F349e999d6b21A4f646e83Cd90c5',
      '0x0000000000000000000000000000000000000000'
    )
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://joinstakehouse.com/',
};
