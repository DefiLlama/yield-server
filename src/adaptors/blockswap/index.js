const utils = require('../utils');

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
    total += ethers.BigNumber.from(stakeHouse.dETHMintedWithinHouse);
  });

  const totalEthMinted = ethers.utils.formatEther(total);

  console.log("Total dETH minted:");
  console.log(totalEthMinted);
  console.log("Underlying price:");
  console.log(underlying.price);
  console.log("Underlying price * dETH minted:");
  console.log(totalEthMinted*underlying.price);

  return {
	pool: `${data.address}`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'blockswap',
    symbol: utils.formatSymbol(data.token),
	tvlUsd: totalEthMinted*underlying.price,
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
