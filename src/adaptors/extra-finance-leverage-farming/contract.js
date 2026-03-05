const sdk = require('@defillama/sdk');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");

const veloPairAddress = {
  optimism: '0xC8229d65581afE8f04344A6706FF45faECC426f9',
  base: '0x27fc745390d1f4BaF8D184FBd97748340f786634'
}

exports.getAllVeloPools = async function (chain, vaults) {
  const poolInfoLists = (
    await sdk.api.abi.multiCall({
      calls: vaults.map((item) => ({
        target: veloPairAddress[chain],
        params: item.pair,
      })),
      abi: pairsSugarContractAbi.find((m) => m.name === 'byAddress'),
      chain,
      permitFailure: true,
    })
  ).output.map((o) => o.output);
  const poolInfoList = poolInfoLists.map(pool => {
    if (!pool) {
      return null
    }
    const [
      lp,
      symbol,
      decimals,
      liquidity,
      type,
      tick,
      sqrt_ratio,
      token0,
      reserve0,
      staked0,
      token1,
      reserve1,
      staked1,
      gauge,
      gauge_liquidity,
      gauge_alive,
      fee,
      bribe,
      factory,
      emissions,
      emissions_token,
      pool_fee,
      unstaked_fee,
      token0_fees,
      token1_fees,
      nfpm,
      alm,
      root,
    ] = pool
    return {
      lp,
      token0,
      token1,
      reserve0,
      reserve1,
      liquidity,
      symbol,
      emissions,
      emissions_token,
    }
  })
  return poolInfoList.filter(pool => !!pool)
}
