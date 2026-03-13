const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const CHAIN = 'base';
const CHAIN_ID = 8453;

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
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const PERFORMANCE_FEE = 0.1; // 10% on earned yield
const STAKING_APY = 14; // conservative: 14% (6M), up to 18% (12M)

const MORPHO_API = 'https://api.morpho.org/graphql';

const morphoVaultsQuery = gql`
  query GetVaults($addresses: [String!]!, $chainId: Int!) {
    vaults(
      where: { address_in: $addresses, chainId_in: [$chainId] }
      first: 100
    ) {
      items {
        address
        state {
          netApy
          apy
          totalAssetsUsd
          totalAssets
          totalSupply
        }
        asset {
          address
          symbol
          decimals
          priceUsd
        }
      }
    }
  }
`;

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

  // Track: morphoVault -> [surfVault, ...] and asset -> [morphoVault, ...]
  const morphoToSurfVaults = {}; // morphoAddr -> Set<surfVaultAddr>
  const assetToMorphoVaults = {}; // assetAddr -> Set<morphoAddr>
  for (const asset of ASSETS) assetToMorphoVaults[asset] = new Set();

  // Add V2 results (all USDC)
  for (let i = 0; i < v2Vaults.length; i++) {
    const morpho = v2MorphoResults[i].output;
    if (morpho && morpho !== ZERO_ADDR) {
      const key = morpho.toLowerCase();
      assetToMorphoVaults[USDC].add(key);
      if (!morphoToSurfVaults[key]) morphoToSurfVaults[key] = new Set();
      morphoToSurfVaults[key].add(v2Vaults[i]);
    }
  }

  // V3 vaults -> assetToVault(asset) for each asset
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

  // --- Step 3: Get balances (TVL per asset) ---

  const balanceCalls = [];
  const balanceCallMeta = []; // track which call belongs to which morpho vault

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

  // Sum shares per Morpho vault
  const sharesPerMorpho = {}; // morphoAddr -> totalShares (BigInt-like string math)
  for (let i = 0; i < balanceResults.length; i++) {
    const { morphoVault } = balanceCallMeta[i];
    const shares = BigInt(balanceResults[i].output || '0');
    sharesPerMorpho[morphoVault] =
      (sharesPerMorpho[morphoVault] || BigInt(0)) + shares;
  }

  // --- Step 4: Query Morpho API for APY + conversion data ---

  const allMorphoAddresses = Object.keys(morphoToSurfVaults);

  let morphoData = {};
  if (allMorphoAddresses.length > 0) {
    const { vaults: morphoVaultsResp } = await request(
      MORPHO_API,
      morphoVaultsQuery,
      {
        addresses: allMorphoAddresses,
        chainId: CHAIN_ID,
      }
    );

    for (const vault of morphoVaultsResp.items) {
      if (vault.state) {
        morphoData[vault.address.toLowerCase()] = {
          netApy: vault.state.netApy || 0,
          totalAssets: BigInt(vault.state.totalAssets || '0'),
          totalSupply: BigInt(vault.state.totalSupply || '1'),
          priceUsd: vault.asset?.priceUsd || 0,
          decimals: vault.asset?.decimals || 18,
          symbol: vault.asset?.symbol || '',
        };
      }
    }
  }

  // --- Step 5: Build yield pools per asset ---

  const pools = [];

  for (const asset of ASSETS) {
    const morphoVaults = [...assetToMorphoVaults[asset]];
    if (morphoVaults.length === 0) continue;

    let totalTvlUsd = 0;
    let weightedApy = 0;

    for (const morphoAddr of morphoVaults) {
      const data = morphoData[morphoAddr];
      if (!data) continue;

      const shares = sharesPerMorpho[morphoAddr] || BigInt(0);
      if (shares === BigInt(0)) continue;

      // Convert shares to underlying assets
      const assets =
        data.totalSupply > BigInt(0)
          ? (shares * data.totalAssets) / data.totalSupply
          : BigInt(0);

      const tvlUsd =
        (Number(assets) / 10 ** data.decimals) * data.priceUsd;

      totalTvlUsd += tvlUsd;
      weightedApy += data.netApy * tvlUsd;
    }

    if (totalTvlUsd < 100) continue; // skip negligible pools

    const avgMorphoApy = totalTvlUsd > 0 ? weightedApy / totalTvlUsd : 0;
    const userApy = avgMorphoApy * (1 - PERFORMANCE_FEE);

    pools.push({
      pool: `surf-liquid-${ASSET_SYMBOLS[asset].toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'surf-liquid',
      symbol: ASSET_SYMBOLS[asset],
      tvlUsd: totalTvlUsd,
      apyBase: userApy * 100,
      underlyingTokens: [asset],
    });
  }

  // --- Step 6: SURF Staking pool ---

  const { output: totalStaked } = await sdk.api.abi.call({
    target: SURF_STAKING,
    abi: 'uint256:totalStaked',
    chain: CHAIN,
  });

  const priceKey = `${CHAIN}:${SURF_TOKEN}`;
  const priceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`
  );
  const surfPrice = priceResp.data?.coins?.[priceKey]?.price || 0;
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
      pool: `surf-liquid-staking-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'surf-liquid',
      symbol: 'SURF',
      tvlUsd: stakingTvl + subscriptionTvl,
      apyBase: 0,
      apyReward: STAKING_APY,
      rewardTokens: [SURF_TOKEN],
      underlyingTokens: [SURF_TOKEN],
      poolMeta: '14% APY (6M lock) / 18% APY (12M lock)',
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://surfliquid.com',
};
