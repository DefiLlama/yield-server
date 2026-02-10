const utils = require('../utils');
const BigNumber = require('bignumber.js');
const superagent = require('superagent');

const chainId = 'neutron';
const restEndpoint = 'https://rest-lb.neutron.org';
const BLOCKS_PER_DAY = 86400; // Approximately 1 second per block on Neutron
const APY_PERIOD_DAYS = 4; // APY calculation period

const vaults = [
  // ATOM vault
  {
    controlCenterContract: 'neutron1vk3cy35cudlpk8w9kuu9prcanc49n3ajcnu86a43ue9ln6v4v6zsaucnw9',
    vault_deposit_denom: 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9',
    origin_asset: {
      symbol: "uatom",
      display_symbol: "ATOM",
      chain: "cosmos",
      decimals: 6
    }
  },
  // BTC vault
  {
    controlCenterContract: 'neutron1c3djqnwur4aryxe7knr4kvcm3hj2wvnl5887lc5dwsh7z40pf2cq9flznr',
    vault_deposit_denom: 'ibc/0E293A7622DC9A6439DB60E6D234B5AF446962E27CA3AB44D0590603DFF6968E',
    origin_asset: {
      symbol: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      display_symbol: "BTC",
      chain: "ethereum",
      decimals: 8
    }
  },
  // USDC vault
  {
    controlCenterContract: 'neutron1d054u05vx29k20gqrj5h2h2lz7pl7x9fch4ypl5jmaj6q5yw4vgsgk4lx0',
    vault_deposit_denom: 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81',
    origin_asset: {
      symbol: "uusdc",
      display_symbol: "USD",
      chain: "noble",
      decimals: 6
    }
  },
];

async function apy() {
  const apyData = [];

  // Get current and previous block heights
  const currentHeight = await getCurrentHeight();
  const previousHeight = currentHeight - (APY_PERIOD_DAYS * BLOCKS_PER_DAY);

  // Get block data with timestamps for both blocks
  const currentBlock = await getBlockData(currentHeight);
  const previousBlock = await getBlockData(previousHeight);

  // Calculate days between blocks
  const currentTime = new Date(currentBlock.time).getTime();
  const previousTime = new Date(previousBlock.time).getTime();
  const daysSinceBlock = (currentTime - previousTime) / (1000 * 60 * 60 * 24);

  for (const vault of vaults) {
    // Query pool info at current height
    const poolInfoCurrent = await queryContract(
      restEndpoint,
      vault.controlCenterContract,
      { pool_info: {} },
    );

    // Query pool info at previous height
    const poolInfoPrevious = await queryContract(
      restEndpoint,
      vault.controlCenterContract,
      { pool_info: {} },
      previousHeight
    );

    // Calculate price per share (total_pool_value / total_shares_issued) at both heights
    // Use value 1 if total_shares_issued is 0 to avoid divide by zero
    const pricePerShareNew = poolInfoCurrent.total_shares_issued === '0' || poolInfoCurrent.total_shares_issued === 0
      ? new BigNumber(1)
      : new BigNumber(poolInfoCurrent.total_pool_value).dividedBy(poolInfoCurrent.total_shares_issued);
    
    const pricePerShareOld = poolInfoPrevious.total_shares_issued === '0' || poolInfoPrevious.total_shares_issued === 0
      ? new BigNumber(1)
      : new BigNumber(poolInfoPrevious.total_pool_value).dividedBy(poolInfoPrevious.total_shares_issued);

    // apy = (new_ratio/old_ratio)^(365/days_since_block) * 100 - 100
    const ratio = pricePerShareNew.dividedBy(pricePerShareOld);
    const apyBase = ratio.pow(Math.floor(365 / daysSinceBlock)).times(100).minus(100).toNumber();

    // Calculate TVL
    const totalLockedTokens = new BigNumber(poolInfoCurrent.total_pool_value).shiftedBy(-vault.origin_asset.decimals);
    const prices = await utils.getPrices([vault.origin_asset.symbol], vault.origin_asset.chain);
    const price = new BigNumber(prices.pricesByAddress[vault.origin_asset.symbol.toLowerCase()]);
    const tvlUsd = totalLockedTokens.times(price).toNumber();

    apyData.push({
          pool: `inflow-${vault.origin_asset.display_symbol}-vault`.toLowerCase(),
          symbol: vault.origin_asset.display_symbol,
          underlyingTokens: [vault.vault_deposit_denom],
          project: 'hydro-inflow',
          chain: chainId,
          tvlUsd: tvlUsd,
          apyBase: apyBase,
          url: 'https://hydro.markets/',
        });
  }

  return apyData;
}

async function queryContract(api, contract, data, height = null) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  const encodedData = Buffer.from(data).toString('base64');
  const endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}`;

  let request = superagent.get(endpoint);

  if (height !== null) {
    request = request.set('x-cosmos-block-height', height.toString());
  }

  const result = await request;
  return result.body.data;
}

async function getCurrentHeight() {
  const result = await utils.getData(
    `${restEndpoint}/cosmos/base/tendermint/v1beta1/blocks/latest`
  );
  return parseInt(result.block.header.height);
}

async function getBlockData(height) {
  const result = await utils.getData(
    `${restEndpoint}/cosmos/base/tendermint/v1beta1/blocks/${height}`
  );
  return {
    height: parseInt(result.block.header.height),
    time: result.block.header.time
  };
}

module.exports = {
  apy,
  timetravel: false,
  url: 'https://hydro.markets/',
};
