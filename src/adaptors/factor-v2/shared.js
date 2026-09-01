const sdk = require('@defillama/sdk');
const utils = require('../utils');

const {
  getMuxLpApr,
  getGlpApr,
  getVlpApr,
  getLodestarApr,
  getLodestarTokenPriceInUSD,
  getPendleApr,
  getSJoeApr,
  getSiloApr,
  getTenderApr,
  getOliveApr,
  getPxGMXApr,
  getPenpieApr,
} = require('./strategy-adapter');
const { getCoinDataFromDefillamaAPI } = require('./strategy-adapter/utils');

async function getApr(poolAddress, underlyingTokenAddress, strategy) {
  let apr = 0;
  switch (strategy) {
    case 'GLPStrategy':
      apr = await getGlpApr();
      break;
    case 'MuxStrategy':
      apr = await getMuxLpApr();
      break;
    case 'VelaStrategy':
      apr = await getVlpApr();
      break;
    case 'LodestarStrategy':
      apr = await getLodestarApr(underlyingTokenAddress);
      break;
    case 'PenpieStrategy':
      apr = await getPenpieApr(underlyingTokenAddress);
      break;
    case 'PendleStrategy':
      apr = await getPendleApr(underlyingTokenAddress);
      break;
    case 'TraderJoeStrategy':
      apr = await getSJoeApr(underlyingTokenAddress);
      break;
    case 'SiloStrategy':
      apr = await getSiloApr(underlyingTokenAddress);
      break;
    case 'TenderStrategy':
      apr = await getTenderApr(underlyingTokenAddress);
      break;
    case 'OliveStrategy':
      apr = await getOliveApr();
      break;
    case 'RedactedStrategy':
      apr = await getPxGMXApr();
      break;
    default:
      apr = 0;
  }

  const harvestCountPerDay = 3;
  const apyBase = utils.aprToApy(apr, harvestCountPerDay * 365);

  return apyBase;
}

async function getTvl(poolAddress, underlyingTokenAddress, strategy) {
  let underlyingTokenPrice = 0;

  if (strategy == 'LodestarStrategy') {
    underlyingTokenPrice = await getLodestarTokenPriceInUSD(
      underlyingTokenAddress
    );
  } else if (strategy == 'RedactedStrategy') {
    const gmxCoin = await getCoinDataFromDefillamaAPI(
      'arbitrum',
      '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a'
    );
    underlyingTokenPrice = gmxCoin.price;
  } else {
    underlyingTokenPrice = (
      await utils.getPrices([underlyingTokenAddress], 'arbitrum')
    ).pricesByAddress[underlyingTokenAddress.toLowerCase()];
  }

  const [{ output: assetBalance }, { output: assetDecimals }] =
    await Promise.all([
      sdk.api.abi.call({
        target: poolAddress,
        abi: 'uint256:assetBalance',
        chain: 'arbitrum',
      }),
      sdk.api.abi.call({
        target: underlyingTokenAddress,
        abi: 'erc20:decimals',
        chain: 'arbitrum',
      }),
    ]);

  const tvlUsd = (assetBalance / 10 ** assetDecimals) * underlyingTokenPrice;

  return tvlUsd;
}

module.exports = { getTvl, getApr };
