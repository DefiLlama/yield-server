const ethers = require("ethers")
const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const providers = require('@defillama/sdk/build/providers.json');
const { GET_POOL_CONFIG_ABI, GET_POOL_INFO_ABI, POSITION_ABI, MARKET_ABI } = require('./abi');

const config = {
  ethereum: { registry: '0xbe082293b646cb619a638d29e8eff7cf2f46aa3a', },
  xdai: { registry: '0x666fa9ef9bca174a042c4c306b23ba8ee0c59666', },
  base: { registry: '0x6668310631Ad5a5ac92dC9549353a5BaaE16C666', },
  linea: { registry: '0x6668310631Ad5a5ac92dC9549353a5BaaE16C666', },
}

function queryBaseTokenBalance(config, poolContract) {
  if (config.baseToken === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    // ETH case
    return sdk.api.eth.getBalance({
      target: poolContract.address,
      chain: config.chain
    }).then(result => result.output);
  } else if (config.kind.toLowerCase().includes('lp')) {
    // LP token case
    return sdk.api.abi.call({
      target: poolContract.address,
      chain: config.chain,
      abi: 'function gauge() view returns (address)',
    }).then(gaugeResult => {
      const gauge_contract_address = gaugeResult.output;
      return sdk.api.erc20.balanceOf({
        target: gauge_contract_address,
        owner: poolContract.address,
        chain: config.chain
      }).then(balanceResult => balanceResult.output);
    });
  } else if (config.baseToken !== ethers.constants.AddressZero) {
    // Standard ERC20 case
    return sdk.api.erc20.balanceOf({
      target: config.baseToken,
      owner: poolContract.address,
      chain: config.chain
    }).then(result => result.output);
  }
  return '0';
}

function encodeMorphoMarketIds(baseToken, collateral, oracle, irm, lltv) {
  const packedIds = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'address', 'address', 'uint256'],
    [baseToken, collateral, oracle, irm, lltv]
  );
  return ethers.utils.keccak256(packedIds);
}

async function calculateMorphoVaultSharesBalance(poolContract, config) {
  const vaultContractAddress = (
    await sdk.api.abi.call({
      target: poolContract.address,
      abi: 'function vault() view returns (address)',
      chain: config.chain
    })
  ).output;

  const [collateralToken, oracle, irm, lltv] = await Promise.all([
    sdk.api.abi.call({
      target: poolContract.address,
      abi: 'function collateralToken() view returns (address)',
      chain: config.chain
    }),
    sdk.api.abi.call({
      target: poolContract.address,
      abi: 'function oracle() view returns (address)',
      chain: config.chain
    }),
    sdk.api.abi.call({
      target: poolContract.address,
      abi: 'function irm() view returns (address)',
      chain: config.chain
    }),
    sdk.api.abi.call({
      target: poolContract.address,
      abi: 'function lltv() view returns (uint256)',
      chain: config.chain
    })
  ]);

  const morphoMarketId = encodeMorphoMarketIds(config.baseToken, collateralToken.output, oracle.output, irm.output, lltv.output);

  const position = (
    await sdk.api.abi.call({
      target: vaultContractAddress,
      abi: POSITION_ABI,
      params: [morphoMarketId, poolContract.address],
      chain: config.chain
    })
  ).output;

  const market = (
    await sdk.api.abi.call({
      target: vaultContractAddress,
      abi: MARKET_ABI,
      params: [morphoMarketId],
      chain: config.chain
    })
  ).output;

  // https://github.com/morpho-org/morpho-blue/blob/a4210e9198bf5e3aa3cde891e035f33dcb31e0de/src/libraries/SharesMathLib.sol#L33
  const vaultSharePrice = (market.totalSupplyAssets + 1) / (market.totalSupplyShares + 1e6) * 1e12;

  return position.supplyShares / 1e6 * vaultSharePrice;
}

async function calculateVanillaVaultSharesBalance(poolContract, config) {
  return (await sdk.api.erc20.balanceOf({
    target: config.vaultSharesToken,
    owner: poolContract.address,
    chain: config.chain
  })).output;
}

async function queryVaultSharesBalance(poolContract, config, baseTokenBalance) {
  if (config.kind === "MorphoBlueHyperdrive") return calculateMorphoVaultSharesBalance(poolContract, config);
  if (config.vaultSharesToken !== ethers.constants.AddressZero) return calculateVanillaVaultSharesBalance(poolContract, config);
  return baseTokenBalance;  // Otherwise, use base token balance as vault shares balance
}

async function queryPoolHoldings(poolContract, config) {
  let baseTokenBalance = await queryBaseTokenBalance(config, poolContract);
  return queryVaultSharesBalance(poolContract, config, baseTokenBalance);
}

async function calculateAPYfromPool(pool) {
  // https://github.com/delvtech/hyperdrive/blob/8347e32d566258da44c44984c8b70f06517f6e46/contracts/src/libraries/HyperdriveMath.sol#L78-L173
  const effective_share_reserves = pool.info.shareReserves - pool.info.shareAdjustment;
  const ratio = (pool.config.initialVaultSharePrice / 1e18 * effective_share_reserves) / pool.info.bondReserves;
  const spot_price = Math.pow(ratio, pool.config.timeStretch / 1e18);
  const time_stretch = pool.config.positionDuration / (365 * 24 * 60 * 60);
  const APR = (1 - spot_price) / (spot_price * time_stretch);

  // convert APR to APY
  // time_stretch is in fractions of a year so we can use it to convert from apr to apy
  // compounding happens every time_stretch years, so we use discrete compounding formula
  const APY = Math.pow(1 + APR * time_stretch, 1 / time_stretch) - 1;

  return APY;
}

async function getApy(chain) {
  const registry = config[chain].registry;

  try {
    // First get the number of instances
    const numInstances = (
      await sdk.api.abi.call({
        target: registry,
        chain,
        abi: 'function getNumberOfInstances() view returns (uint256)',
      })
    ).output;

    // Then fetch each instance
    const instanceCalls = Array.from({ length: Number(numInstances) }, (_, i) => ({
      target: registry,
      params: [i],
    }));

    let instances = (
      await sdk.api.abi.multiCall({
        abi: 'function getInstanceAtIndex(uint256) view returns (address)',
        calls: instanceCalls,
        chain,
      })
    ).output.map(o => o.output);

    const poolNames = (
      await sdk.api.abi.multiCall({
        abi: 'function name() view returns (string)',
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const poolConfig = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_CONFIG_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const poolKinds = (
      await sdk.api.abi.multiCall({
        abi: 'function kind() pure returns (string)',
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    // First try to check if gauge function exists using a try-catch
    const hasGauge = await Promise.all(
      instances.map(async (instance) => {
        try {
          const result = await sdk.api.abi.call({
            target: instance,
            chain,
            abi: 'function gauge() view returns (address)',
          });
          return result.output !== ethers.constants.AddressZero;
        } catch (e) {
          return false;
        }
      })
    );

    // Add chain and kind to each config
    poolConfig.forEach((config, index) => {
      config.chain = chain;
      config.kind = poolKinds[index];
      config.hasGauge = hasGauge[index];
    });

    // Get token addresses and fetch prices
    await Promise.all(poolConfig.map(async config => {
      let priceWithBase = false;
      let tokenAddress = config.vaultSharesToken === ethers.constants.AddressZero
        ? config.baseToken
        : config.vaultSharesToken;
      try {
        let priceKey = `${chain}:${tokenAddress}`;
        config.token_contract_address = tokenAddress;
        let priceResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
        let price = priceResponse.data.coins[priceKey];
        // some share tokens (like sGYD) have no price
        // so instead we price the base token (like GYD) and multiply by the latest vaultSharePrice in Hyperdrive
        if (price === undefined && config.baseToken !== ethers.constants.AddressZero) {
          tokenAddress = config.baseToken;
          priceKey = `${chain}:${tokenAddress}`;
          priceResponse = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
          price = priceResponse.data.coins[priceKey];
          config.token_contract_address = config.baseToken;
          priceWithBase = true;
        }
        config.token = price;
        config.token.priceWithBase = priceWithBase;
        config.token.address = tokenAddress;
      } catch (error) {
        console.error(`Error fetching price for ${priceKey}:`, error);
        // Return default token price info
        config.token = { price: 0, decimals: 0, symbol: '?', priceWithBase: priceWithBase, address: tokenAddress };
      }
    }));

    const poolInfos = (
      await sdk.api.abi.multiCall({
        abi: GET_POOL_INFO_ABI,
        calls: instances.map(i => ({ target: i })),
        chain
      })
    ).output.map(o => o.output);

    const pools = poolNames.map((name, i) => ({ name, config: poolConfig[i], info: poolInfos[i], address: instances[i] }))

    const poolsData = await Promise.allSettled(
      pools.map(async (pool) => {
        try {
          const APY = await calculateAPYfromPool(pool);

          const vaultSharesBalance = await queryPoolHoldings(pool, pool.config);

          let tvlUsd = (vaultSharesBalance / 10 ** pool.config.token.decimals) * pool.config.token.price;
          // apply vaultSharePrice from config if priceWithBase is true
          if (pool.config.token.priceWithBase) tvlUsd = tvlUsd * pool.info.vaultSharePrice / 1e18;

          const result = {
            pool: pool.address,
            chain,
            project: 'hyperdrive',
            symbol: pool.config.token.symbol,
            tvlUsd: Number(tvlUsd) || 0,
            apyBase: APY * 100,
            underlyingTokens: [pool.config.token_contract_address],
            url: `https://app.hyperdrive.box/market/${providers[chain].chainId}/${pool.address}`,
            poolMeta: `Matures in ${pool.config.positionDuration / (24 * 60 * 60).toFixed(0)} days from position open`
          };
          return result;
        } catch (error) {
          console.error('Error processing pool:', pool.name, error);
          return null;
        }
      })
    );

    return poolsData
      .filter((i) => i.status === 'fulfilled')
      .map((i) => i.value);
  } catch (error) {
    console.error('Error getting APY for chain:', chain, error);
    return [];
  }
}

async function apy() {
  const pools = await Promise.allSettled(
    Object.keys(config).map(async (chain) => getApy(chain))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter(Boolean);
}

module.exports = {
  apy,
};
