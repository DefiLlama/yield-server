const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'base';

const V2_FACTORY = '0x1D283b668F947E03E8ac8ce8DA5505020434ea0E';
const V3_FACTORY = '0xf1d64dee9f8e109362309a4bfbb523c8e54fa1aa';
const V3_DEPLOY_FROM_BLOCK = 38856207;
const SURF_STAKING = '0xB0fDFc081310A5914c2d2c97e7582F4De12FA9d6';
const SURF_TOKEN = '0xcdca2eaae4a8a6b83d7a3589946c2301040dafbf';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const CBBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const ASSETS = [USDC, WETH, CBBTC];
const ASSET_SYMBOLS = {
  [USDC]: 'USDC',
  [WETH]: 'WETH',
  [CBBTC]: 'cbBTC',
};
const ASSET_DECIMALS = {
  [USDC]: 6,
  [WETH]: 18,
  [CBBTC]: 8,
};
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const PERFORMANCE_FEE = 0.1; // 10% on earned yield

const apy = async () => {
  // --- Step 1: Discover Surf Liquid vault addresses ---

  // V2 vaults from factory
  const { output: totalV2 } = await sdk.api.abi.call({
    target: V2_FACTORY,
    abi: 'uint256:getTotalVaults',
    chain: CHAIN,
  });

  const { output: v2Infos } = await sdk.api.abi.multiCall({
    abi: 'function getVaultInfo(uint256) view returns (address, address, address, uint256, bytes32, uint256)',
    calls: [...Array(Number(totalV2)).keys()].map((i) => ({
      target: V2_FACTORY,
      params: [i],
    })),
    chain: CHAIN,
  });
  const v2Vaults = v2Infos.map((info) => info.output[0]);

  // V3 vaults from factory deploy events
  const currentBlock = (await sdk.api.util.getLatestBlock(CHAIN)).number;
  const v3Logs = await sdk.getEventLogs({
    target: V3_FACTORY,
    fromBlock: V3_DEPLOY_FROM_BLOCK,
    toBlock: currentBlock,
    chain: CHAIN,
    eventAbi:
      'event VaultDeployed(address indexed vaultAddress, address indexed owner, address indexed pool, bytes32 marketId, uint256 chainId)',
  });
  const v3Vaults = v3Logs.map((l) => l.args.vaultAddress);

  // --- Step 2: Get current Morpho vaults per asset ---

  // V2 vaults -> currentVault() (USDC only)
  const { output: v2MorphoResults } = await sdk.api.abi.multiCall({
    abi: 'address:currentVault',
    calls: v2Vaults.map((target) => ({ target })),
    chain: CHAIN,
  });

  const morphoToSurfVaults = {};
  const assetToMorphoVaults = {};
  for (const asset of ASSETS) assetToMorphoVaults[asset] = new Set();

  for (let i = 0; i < v2Vaults.length; i++) {
    const morpho = v2MorphoResults[i].output;
    if (morpho && morpho !== ZERO_ADDR) {
      const key = morpho.toLowerCase();
      assetToMorphoVaults[USDC].add(key);
      if (!morphoToSurfVaults[key]) morphoToSurfVaults[key] = new Set();
      morphoToSurfVaults[key].add(v2Vaults[i]);
    }
  }

  for (const asset of ASSETS) {
    if (v3Vaults.length === 0) continue;
    const { output: morphoResults } = await sdk.api.abi.multiCall({
      abi: 'function assetToVault(address) view returns (address)',
      calls: v3Vaults.map((vault) => ({ target: vault, params: [asset] })),
      chain: CHAIN,
    });

    for (let i = 0; i < v3Vaults.length; i++) {
      const morpho = morphoResults[i].output;
      if (morpho && morpho !== ZERO_ADDR) {
        const key = morpho.toLowerCase();
        assetToMorphoVaults[asset].add(key);
        if (!morphoToSurfVaults[key]) morphoToSurfVaults[key] = new Set();
        morphoToSurfVaults[key].add(v3Vaults[i]);
      }
    }
  }

  // --- Step 3: Get balances (shares held in Morpho vaults) ---

  const balanceCalls = [];
  const balanceCallMeta = [];

  for (const [morphoVault, surfVaults] of Object.entries(morphoToSurfVaults)) {
    for (const surfVault of surfVaults) {
      balanceCalls.push({ target: morphoVault, params: [surfVault] });
      balanceCallMeta.push({ morphoVault, surfVault });
    }
  }

  const { output: balanceResults } = await sdk.api.abi.multiCall({
    abi: 'function balanceOf(address) view returns (uint256)',
    calls: balanceCalls,
    chain: CHAIN,
  });

  const sharesPerMorpho = {};
  for (let i = 0; i < balanceResults.length; i++) {
    const { morphoVault } = balanceCallMeta[i];
    const shares = BigInt(balanceResults[i].output || '0');
    sharesPerMorpho[morphoVault] =
      (sharesPerMorpho[morphoVault] || BigInt(0)) + shares;
  }

  // --- Step 4: On-chain APY from Morpho vault share price changes ---

  const allMorphoAddresses = Object.keys(morphoToSurfVaults);

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const [blockNow, blockPast] = await utils.getBlocksByTime(
    [now, dayAgo],
    CHAIN
  );

  const [assetsNowRes, supplyNowRes] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'uint256:totalAssets',
      calls: allMorphoAddresses.map((target) => ({ target })),
      chain: CHAIN,
      block: blockNow,
    }),
    sdk.api.abi.multiCall({
      abi: 'uint256:totalSupply',
      calls: allMorphoAddresses.map((target) => ({ target })),
      chain: CHAIN,
      block: blockNow,
    }),
  ]);

  const [assetsPastRes, supplyPastRes] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'uint256:totalAssets',
      calls: allMorphoAddresses.map((target) => ({ target })),
      chain: CHAIN,
      block: blockPast,
    }),
    sdk.api.abi.multiCall({
      abi: 'uint256:totalSupply',
      calls: allMorphoAddresses.map((target) => ({ target })),
      chain: CHAIN,
      block: blockPast,
    }),
  ]);

  const morphoData = {};
  for (let i = 0; i < allMorphoAddresses.length; i++) {
    const addr = allMorphoAddresses[i];
    const aNow = Number(assetsNowRes.output[i].output || '0');
    const sNow = Number(supplyNowRes.output[i].output || '1');
    const aPast = Number(assetsPastRes.output[i].output || '0');
    const sPast = Number(supplyPastRes.output[i].output || '1');

    const priceNow = sNow > 0 ? aNow / sNow : 1;
    const pricePast = sPast > 0 ? aPast / sPast : 1;
    const apyVal =
      pricePast > 0 ? Math.pow(priceNow / pricePast, 365) - 1 : 0;

    morphoData[addr] = {
      apy: Math.max(apyVal, 0),
      totalAssets: BigInt(assetsNowRes.output[i].output || '0'),
      totalSupply: BigInt(supplyNowRes.output[i].output || '1'),
    };
  }

  // --- Step 5: Get asset prices ---

  const priceKeys = ASSETS.map((a) => `${CHAIN}:${a}`).join(',');
  const priceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  const prices = {};
  for (const asset of ASSETS) {
    const key = `${CHAIN}:${asset}`;
    prices[asset] = priceResp.data?.coins?.[key]?.price || 0;
  }

  // --- Step 6: Build yield pools per asset ---

  const pools = [];

  for (const asset of ASSETS) {
    const morphoVaults = [...assetToMorphoVaults[asset]];
    if (morphoVaults.length === 0) continue;

    let totalTvlUsd = 0;
    let weightedApy = 0;
    const decimals = ASSET_DECIMALS[asset];

    for (const morphoAddr of morphoVaults) {
      const data = morphoData[morphoAddr];
      if (!data) continue;

      const shares = sharesPerMorpho[morphoAddr] || BigInt(0);
      if (shares === BigInt(0)) continue;

      const assets =
        data.totalSupply > BigInt(0)
          ? (shares * data.totalAssets) / data.totalSupply
          : BigInt(0);

      const tvlUsd = (Number(assets) / 10 ** decimals) * prices[asset];

      totalTvlUsd += tvlUsd;
      weightedApy += data.apy * tvlUsd;
    }

    if (totalTvlUsd < 100) continue;

    const avgMorphoApy = totalTvlUsd > 0 ? weightedApy / totalTvlUsd : 0;
    const userApy = avgMorphoApy * (1 - PERFORMANCE_FEE);

    pools.push({
      pool: `${V3_FACTORY.toLowerCase()}-${ASSET_SYMBOLS[asset].toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'surf-liquid',
      symbol: ASSET_SYMBOLS[asset],
      tvlUsd: totalTvlUsd,
      apyBase: userApy * 100,
      underlyingTokens: [asset],
    });
  }

  // --- Step 7: SURF Staking pool (APR from on-chain) ---

  const [
    { output: totalStaked },
    { output: apr6M },
    { output: apr12M },
    { output: basisPoints },
  ] = await Promise.all([
    sdk.api.abi.call({
      target: SURF_STAKING,
      abi: 'uint256:totalStaked',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SURF_STAKING,
      abi: 'uint256:apr6Months',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SURF_STAKING,
      abi: 'uint256:apr12Months',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SURF_STAKING,
      abi: 'uint256:BASIS_POINTS',
      chain: CHAIN,
    }),
  ]);

  const stakingApr6M = (Number(apr6M) / Number(basisPoints)) * 100;
  const stakingApr12M = (Number(apr12M) / Number(basisPoints)) * 100;

  const surfPriceKey = `${CHAIN}:${SURF_TOKEN}`;
  const surfPriceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${surfPriceKey}?searchWidth=24h`
  );
  const surfPrice = surfPriceResp.data?.coins?.[surfPriceKey]?.price || 0;
  const stakingTvl = (Number(totalStaked) / 1e18) * surfPrice;

  // CreatorBid subscriptions (SURF locked in token contract)
  const { output: subscribedBalance } = await sdk.api.abi.call({
    target: SURF_TOKEN,
    abi: 'function balanceOf(address) view returns (uint256)',
    params: [SURF_TOKEN],
    chain: CHAIN,
  });
  const subscriptionTvl = (Number(subscribedBalance) / 1e18) * surfPrice;

  if (stakingTvl > 100) {
    pools.push({
      pool: `${SURF_STAKING.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'surf-liquid',
      symbol: 'SURF',
      tvlUsd: stakingTvl + subscriptionTvl,
      apyBase: 0,
      apyReward: stakingApr6M,
      rewardTokens: [SURF_TOKEN],
      underlyingTokens: [SURF_TOKEN],
      poolMeta: `${stakingApr6M}% APR (6M lock) / ${stakingApr12M}% APR (12M lock)`,
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://surfliquid.com',
};
