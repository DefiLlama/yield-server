const {
  PoolV2,
  BackstopToken,
  Backstop,
  FixedMath,
  TokenMetadata,
} = require('@blend-capital/blend-sdk');
const { getPrices, keepFinite, formatChain, getData } = require('../utils');

const BACKSTOP_ID = 'CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7';
const BLND_ID = 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY';
const BLEND_POOLS = [
  'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD',
  'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS',
];
const NETWORK = {
  rpc: 'https://soroban-rpc.creit.tech/',
  passphrase: 'Public Global Stellar Network ; September 2015',
};

const getApy = async (poolId, backstop, blndPrice) => {
  const pool = await PoolV2.load(NETWORK, poolId);
  // Skip pools that have been admin frozen - Pool is very likely to be broken
  if (pool.metadata.status === 4) return [];

  const prices = await getPrices(pool.metadata.reserveList, 'stellar');
  let pools = [];

  for (const reserve of Array.from(pool.reserves.values())) {
    const price = prices.pricesByAddress[reserve.assetId.toLowerCase()];

    if (price) {
      let tokenMetadata = await TokenMetadata.load(NETWORK, reserve.assetId);
      let supplyEmissionsAPR = undefined;
      let borrowEmissionsAPR = undefined;
      if (reserve.supplyEmissions) {
        const supplyEmissionsPerAsset =
          reserve.supplyEmissions.emissionsPerYearPerToken(
            reserve.totalSupply(),
            reserve.config.decimals
          );

        supplyEmissionsAPR = (supplyEmissionsPerAsset * blndPrice) / price;
      }
      if (reserve.borrowEmissions) {
        const borrowEmissionsPerAsset =
          reserve.borrowEmissions.emissionsPerYearPerToken(
            reserve.totalLiabilities(),
            reserve.config.decimals
          );
        borrowEmissionsAPR = (borrowEmissionsPerAsset * blndPrice) / price;
      }

      let totalSupply = reserve.totalSupplyFloat() * price;
      let totalBorrow = reserve.totalLiabilitiesFloat() * price;
      const url = `https://mainnet.blend.capital/dashboard/?poolId=${poolId}`;

      pools.push({
        pool: `${pool.id}-${reserve.assetId}-stellar`.toLowerCase(),
        chain: formatChain('stellar'),
        project: 'blend-pools-v2',
        symbol: tokenMetadata.symbol,
        tvlUsd: totalSupply - totalBorrow,
        //Estimated weekly compounding
        apyBase: reserve.supplyApr * 100,
        apyReward: supplyEmissionsAPR * 100,
        underlyingTokens: [reserve.assetId],
        rewardTokens: borrowEmissionsAPR || supplyEmissionsAPR ? [BLND_ID] : [],
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        // Estimated daily compounding
        apyBaseBorrow: reserve.estBorrowApy * 100,
        apyRewardBorrow: borrowEmissionsAPR * 100,
        ltv: totalBorrow / totalSupply,
        poolMeta: `${pool.metadata.name} Pool`,
        url,
      });
    }
  }
  return pools;
};

const apy = async () => {
  let backstop = await Backstop.load(NETWORK, BACKSTOP_ID);
  let pools = [];
  const data = await getData(
    'https://coins.llama.fi/prices/current/coingecko:blend'
  );
  for (const poolId of BLEND_POOLS) {
    let poolApys = await getApy(
      poolId,
      backstop,
      data.coins['coingecko:blend'].price
    );
    pools.push(...poolApys);
  }
  return pools;
};

module.exports = {
  apy,
};
