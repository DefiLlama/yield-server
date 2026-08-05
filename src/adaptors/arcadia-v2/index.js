const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { poolABI } = require('./abi');

const riskFactorsAbi =
  'function getRiskFactors(address creditor, address asset, uint256 assetId) external view returns (uint16 collateralFactor, uint16 liquidationFactor)';

// deployed at the same address on all chains
const erc20AssetModule = '0xfBecEaFC96ed6fc800753d3eE6782b6F9a60Eed7';

const config = {
  base: {
    chainId: 8453,
    assets: {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      wETH: '0x4200000000000000000000000000000000000006',
      DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
      USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
      cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    },
    pools: [
      {
        symbol: 'wETH',
        address: '0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2',
        underlying: '0x4200000000000000000000000000000000000006',
        decimals: 18,
        poolMeta: 'Arcadia V2 WETH Pool',
      },
      {
        symbol: 'USDC',
        address: '0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1',
        underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        poolMeta: 'Arcadia V2 USDC Pool',
      },
      {
        symbol: 'cbBTC',
        address: '0xa37E9b4369dc20940009030BfbC2088F09645e3B',
        underlying: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
        decimals: 8,
        poolMeta: 'Arcadia V2 cbBTC Pool',
      },
    ],
  },
  optimism: {
    chainId: 10,
    assets: {
      USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      wETH: '0x4200000000000000000000000000000000000006',
    },
    pools: [
      {
        symbol: 'wETH',
        address: '0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2',
        underlying: '0x4200000000000000000000000000000000000006',
        decimals: 18,
        poolMeta: 'Arcadia V2 WETH Pool',
      },
      {
        symbol: 'USDC',
        address: '0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1',
        underlying: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        decimals: 6,
        poolMeta: 'Arcadia V2 USDC Pool',
      },
    ],
  },
};

const getMaxCollFactor = async (chain, creditor, assets) => {
  const collFactors = await sdk.api.abi.multiCall({
    abi: riskFactorsAbi,
    calls: Object.values(assets).map((assetAddress) => ({
      target: erc20AssetModule,
      params: [creditor, assetAddress, 0], //[creditor, asset, assetId=0 for erc20]
    })),
    chain,
  });

  return Math.max(
    ...collFactors.output.map((factor) =>
      parseInt(factor.output.collateralFactor)
    )
  );
};

const getApy = async () => {
  const priceKeys = Object.entries(config)
    .flatMap(([chain, { pools }]) =>
      pools.map((pool) => `${chain}:${pool.underlying}`)
    )
    .join(',');
  const coinPrices = await utils.getPriceApiData(`/prices/current/${priceKeys}`);

  const results = [];
  for (const [chain, chainConfig] of Object.entries(config)) {
    for (const pool of chainConfig.pools) {
      const totalDebt = (
        await sdk.api.abi.call({
          target: pool.address,
          abi: poolABI.filter(({ name }) => name === 'totalAssets')[0],
          chain,
        })
      ).output;
      const totalLiquidity = (
        await sdk.api.abi.call({
          target: pool.address,
          abi: poolABI.filter(({ name }) => name === 'totalLiquidity')[0],
          chain,
        })
      ).output;
      const interestRate = (
        await sdk.api.abi.call({
          target: pool.address,
          abi: poolABI.filter(({ name }) => name === 'interestRate')[0],
          chain,
        })
      ).output;

      const priceData = coinPrices['coins'][`${chain}:${pool.underlying}`];
      if (!priceData) continue;
      const price = priceData.price;
      const scale = 10 ** pool.decimals;

      const apy = (totalDebt * interestRate) / totalLiquidity / 1e18;
      const tvlUsd = ((totalLiquidity - totalDebt) * price) / scale;
      const totalSupplyUsd = (totalLiquidity * price) / scale;
      const totalBorrowUsd = (totalDebt * price) / scale;
      const borrowApy = (interestRate * 100) / 1e18; //interestRate is in 18 decimals, times 100 for pct

      const maxCollFactor = await getMaxCollFactor(
        chain,
        pool.address,
        chainConfig.assets
      );

      results.push({
        // pools share the same address on all chains; base pool ids predate the
        // multichain deployment and must stay the bare address
        pool: chain === 'base' ? pool.address : `${pool.address}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'arcadia-v2',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: apy * 100,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: borrowApy,
        ltv: maxCollFactor / 10_000, // 4 decimal precision
        poolMeta: pool.poolMeta,
        underlyingTokens: [pool.underlying],
        url: `https://arcadia.finance/pool/${chainConfig.chainId}/${pool.address}`,
      });
    }
  }

  return results;
};

module.exports = {
  protocolId: '4455',
  timetravel: false,
  apy: getApy,
  url: 'https://arcadia.finance/earn',
};
