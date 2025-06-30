const sdk = require('@defillama/sdk');
const { getData } = require('../utils');

const ADDRESSES = {
  base: {
    LeverageXJAVVault: '0x96aF2003ab259a56104d639eb6ed9EACe54B1142',
    LeverageXJAVLISPool: '0xdfc8c41816Cd6CCa9739f946e73b4eeB17195836',
    LeverageXLLPPool: '0xFd916d70eB2d0E0E1C17A6a68a7FBEdE3106b852',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    wETH: '0x4200000000000000000000000000000000000006',
    JAV: '0xEdC68c4c54228D273ed50Fc450E253F685a2c6b9',
    JAVLIS: '0x440D06b2aC83Ff743d9e149Be582A4b2b2c6adEc'

  },
};

// NOTE: OUR SUBGRAPH IS NOT CAUGHT UP TO DATE, SO WE ARE USING THE API FOR NOW
// -----------------------------------------------------------------------------
// We will reenable time travel once our subgraph is caught up
const main = async (timestamp = null) => {
  // timestamp = timestamp ? parseInt(timestamp) : Math.floor(Date.now() / 1000);

  // NOTE: OUR SUBGRAPH IS NOT CAUGHT UP TO DATE, SO WE ARE USING THE API FOR NOW
  // -----------------------------------------------------------------------------
  // Get total fees distributed for junior and senior tranches
  // const feesDistributedIds = await fetchFeeDistributedIds(timestamp);
  // const { totalJunior, totalSenior } = await fetchTransfersForFeeDistributedIds(
  //   feesDistributedIds
  // );

  // const [block] = await getBlocksByTime([timestamp], 'base');

  const meta = await getData(
    'https://1f5i4e87mf.execute-api.eu-central-1.amazonaws.com/prod/cols-stats'
  );

  // Get TVL for junior and senior tranches
  let [javlisTvl, javTvl,
    wethTvl, cbBTCTvl, usdcTvl] = await Promise.all([
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.JAVLIS,
      params: [ADDRESSES.base.LeverageXJAVLISPool],
      chain: 'base',
      // block: block,
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.JAV,
      params: [ADDRESSES.base.LeverageXJAVVault],
      chain: 'base',
      // block: block,
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.wETH,
      params: [ADDRESSES.base.LeverageXLLPPool],
      chain: 'base',
      // block: block,
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.cbBTC,
      params: [ADDRESSES.base.LeverageXLLPPool],
      chain: 'base',
      // block: block,
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.USDC,
      params: [ADDRESSES.base.LeverageXLLPPool],
      chain: 'base',
      // block: block,
    }),
  ]);

  javlisTvl = javlisTvl.output / 1e18 * meta.collaterals[4].price;
  javTvl = javTvl.output / 1e18  * meta.collaterals[3].price;

  const wethTvlUsd = wethTvl.output / 1e18 * meta.collaterals[0].price;
  const cbBtcTvlUsd = cbBTCTvl.output / 1e8 * meta.collaterals[1].price;
  const usdcTvlUsd = usdcTvl.output / 1e6;
  const llpTvl = wethTvlUsd + cbBtcTvlUsd + usdcTvlUsd;

  return [
    {
      pool: `LEVERAGEX-${ADDRESSES.base.LeverageXJAVLISPool}-base`.toLowerCase(),
      chain: 'base',
      project: 'javsphere',
      symbol: 'JAVLIS',
      poolMeta: 'xJAVLIS Vault',
      tvlUsd: javlisTvl,
      apyBase: meta.yieldJavlisVault.apy,
      url: 'https://app.leveragex.trade/x-vault/xJAVLIS',
    },
    {
      pool: `LEVERAGEX-${ADDRESSES.base.LeverageXJAVVault}-base`.toLowerCase(),
      chain: 'base',
      project: 'javsphere',
      symbol: 'JAV',
      poolMeta: 'xJAV Vault',
      tvlUsd: javTvl,
      apyBase: meta.yieldJavVault.apy,
      url: 'https://app.leveragex.trade/x-vault/xJAV',
    },
    {
      pool: `LEVERAGEX-${ADDRESSES.base.LeverageXLLPPool}-base`.toLowerCase(),
      chain: 'base',
      project: 'javsphere',
      symbol: 'USDC-wETH-cbBTC',
      poolMeta: 'LLP Pool',
      tvlUsd: llpTvl,
      apyBase: meta.yield.apy,
      url: 'https://app.leveragex.trade/llppool',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
};
