const utils = require('../utils');

const stakingPool = "0xE86D3dBd8233F1BFA22679cB57FaB3428E9654f7";
const sdkChain = 'filecoin'

async function getTotalLockedFIL() {
  const result = await utils.getData('https://api.sftproject.io/api/v1/public/dashboard/info');
  let totalLocked = 0;
  if (result.data.combined !== null) {
    for (let node of result.data.combined) {
      totalLocked += node.AccountAsset;
    }
  }
  if (result.data.independent !== null) {
    for (let node of result.data.independent) {
      totalLocked += node.AccountAsset;
    }
  }
  return totalLocked;
}


const getApy = async () => {

  const apyInfo = await utils.getData('https://api.sftproject.io/api/v1/public/farm/apy');
  const apy = apyInfo.data;

  const totalLockedFIL = await getTotalLockedFIL();
  const filecoinPrice = (await utils.getData('https://coins.llama.fi/prices/current/coingecko:filecoin'))['coins']['coingecko:filecoin']['price'];

  const tvlUsd = totalLockedFIL * filecoinPrice;

  return [{
    pool: `${stakingPool}-${sdkChain}`.toLowerCase(),
    symbol: 'SFT',
    project: 'sft-protocol',
    chain: sdkChain,
    tvlUsd,
    apy,
    poolMeta: '6 month lock'
  }]
}
 
module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.sftproject.io/#/mint',
};