const sdk = require('@defillama/sdk');
const utils = require('../utils');

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const ARM_WETH_STETH_ADDRESS = '0x85b78aca6deae198fbf201c82daf6ca21942acc6';

const apy = async () => {
  const priceData = await utils.getData(
    'https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h'
  );
  const ethPrice = priceData.coins['coingecko:ethereum'].price;

  const apyData = await utils.getData(
    'https://api.originprotocol.com/api/v2/arm-weth-steth/apr/trailing'
  );

  const [wethBalance, stethBalance, outstandingStethBalance] =
    await Promise.all([
      sdk.api.abi.call({
        chain: 'ethereum',
        target: WETH_ADDRESS,
        abi: 'erc20:balanceOf',
        params: [ARM_WETH_STETH_ADDRESS],
      }),
      sdk.api.abi.call({
        chain: 'ethereum',
        target: STETH_ADDRESS,
        abi: 'erc20:balanceOf',
        params: [ARM_WETH_STETH_ADDRESS],
      }),
      sdk.api.abi.call({
        chain: 'ethereum',
        target: ARM_WETH_STETH_ADDRESS,
        abi: 'uint256:lidoWithdrawalQueueAmount',
      }),
    ]);

  const tvlUsd =
    (wethBalance.output / 1e18 +
      stethBalance.output / 1e18 +
      outstandingStethBalance.output / 1e18) *
    ethPrice;

  return [
    {
      pool: ARM_WETH_STETH_ADDRESS,
      chain: utils.formatChain('Ethereum'),
      project: 'origin-arm',
      symbol: 'ARM-WETH-stETH',
      tvlUsd,
      apy: Number(apyData.apy),
      underlyingTokens: [WETH_ADDRESS, STETH_ADDRESS],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://originprotocol.com',
};
