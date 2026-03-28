// UnblockEquity yield adapter for DefiLlama yield-server
// 24 MetaMorpho V2 vaults on Base — USDC lending against residential property liens
// APY = supply APY from Morpho IRM (borrowRateView * utilization * (1 - fee))
// Fallback to modeled netYield if market is empty or IRM unavailable

const { ethers } = require("ethers");

const BASE_RPC = "https://mainnet.base.org";
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const IRM = "0x46415998764C29aB2a25CbeA6254146D50D22687";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SECONDS_PER_YEAR = 31536000;

const MORPHO_ABI = [
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
];

const IRM_ABI = [
  "function borrowRateView(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, tuple(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
];

// 24 vaults: id, vaultAddress, marketId, netYield (modeled fallback APY)
const VAULTS = [
  { id: "V-LO-NONE", vault: "0x287397Fd29aBCdb1f514179099121895A2f5bEAF", marketId: "0x986fdbe36a48d06b417e2478df6a36749b6bc3007d213d64a663717457dfc145", netYield: 7.76, name: "Verified Lien-Only" },
  { id: "V-LO-BR3", vault: "0x376736A69B8F9c350F76E0b2802466Eaee7E058f", marketId: "0x7a829ded90784f87677ce6c3937e3be72fe50dff94b88c270801297bfee2a1d1", netYield: 7.58, name: "Verified Lien BR3" },
  { id: "V-LO-BR6", vault: "0xd6313868B5CeBAd6fDc3aE48F80917B385C01c71", marketId: "0x2200d499132537a83f7ef3819523ace5be21c56ac34db532e3d90d9b2fdb4994", netYield: 7.60, name: "Verified Lien BR6" },
  { id: "V-LO-BR12", vault: "0x2FFcbDEa42311515E3dB1F873A1Cea0D463B5Ced", marketId: "0x15161eae104e3be16ae1396a92fd36edfd8f68915e309a4268f2d224243b77fc", netYield: 7.58, name: "Verified Lien BR12" },
  { id: "V-FC-NONE", vault: "0x0eD4c2cfff2Ec06079e723F51aeFC8cdF073ea68", marketId: "0xbceb193d1d38c2175cbbb67150adea23faa59bea039bf98ff24ea87c1f519dd9", netYield: 7.66, name: "Verified Foreclosure" },
  { id: "V-FC-BR3", vault: "0x34dDd63FEA2868EeF439279D6FeCa7d5AcFc4F53", marketId: "0xf0ef2374ca4e72dcbaafb121a5b2fa6fa37c90aef94285d94f0c585a50f8dffc", netYield: 7.61, name: "Verified FC BR3" },
  { id: "V-FC-BR6", vault: "0xc24C630D27CBF1Da6A78B09821212eb9c5e1be40", marketId: "0xbcdbaf745449618885bc9b191b08b9eae0a89b03bd6cc33934e8a978dba4d23a", netYield: 7.58, name: "Verified FC BR6" },
  { id: "V-FC-BR12", vault: "0x8E246a89a7F8ffD4efD7d037bD585F7741C0C482", marketId: "0x363c5d37ecf3d6aaf3a2c863d4af15bb776ddb618d9251c290367af2b4f56d4d", netYield: 7.55, name: "Verified FC BR12" },
  { id: "P-LO-NONE", vault: "0x13D2E770cefB62A8Aa4e3393d59F88707AbD4dd5", marketId: "0xf0ff0e31eac71ca3b145e4f8b37c2b0d6d594e7c234216c36e1f7c5ce6561f14", netYield: 7.91, name: "Prime Lien-Only" },
  { id: "P-LO-BR3", vault: "0xCc19805E91C66Ca6a3dd437E8F6d579ca9727804", marketId: "0x6b78a3ac1937aa4a4c3177e870b93676f9227d3a8d4ea220dcf3e6123d836e6c", netYield: 7.63, name: "Prime Lien BR3" },
  { id: "P-LO-BR6", vault: "0x2018963CA1e5ACeb88B7fA8738e4AEC846beD752", marketId: "0xcbe9f0f9be21b71a1e0d8c37a3b1b63a43516191e912219a9ae2d1e23ec602aa", netYield: 7.67, name: "Prime Lien BR6" },
  { id: "P-LO-BR12", vault: "0x618fFcf6fF74dC3766B892B7913BF5074B913eF2", marketId: "0x8a6e7b507ba9fe2b2a0fc57ee53b024ebd4cc5352ce53c97e6f794d7a1d1fb9b", netYield: 7.62, name: "Prime Lien BR12" },
  { id: "P-FC-NONE", vault: "0x12d6bA2c11Bbb96F8f91b0412593b87dB4E2ABE2", marketId: "0xa156f1200b5619a67d78a694b59d3f6c2327fedd68d4faf712c0f9aea66a9eff", netYield: 7.70, name: "Prime Foreclosure" },
  { id: "P-FC-BR3", vault: "0xFC274721AFdd37dB10419d08bd0db59E5Fcfb219", marketId: "0x90153d38066e766ed2253d015e9dc4992b4dc1ae3d7f01b17b9fe6ab48da38d7", netYield: 7.64, name: "Prime FC BR3" },
  { id: "P-FC-BR6", vault: "0x098A23332008Cffaf283E3b0e8EcDEcfDeb6849c", marketId: "0xd0aab26e360613fa8d1bdbea06dedda8d10a2942269569715640be4475f4d3ce", netYield: 7.60, name: "Prime FC BR6" },
  { id: "P-FC-BR12", vault: "0xf6EA5C33F0D33B56AAda9AF7Dd1C4203BB83C82F", marketId: "0xed7346873bf45e21d2e623ba36fc004ad7c2c968a9f81375666aa06cd7b4e190", netYield: 7.56, name: "Prime FC BR12" },
  { id: "S-LO-NONE", vault: "0x2BE1d9ddBbd70E7b148E8AdE884600268a0B28BD", marketId: "0x39ed69b74b75b2c1487c7f96e6a744d0fa5369a7f3bacb0b8a253687650e107c", netYield: 9.26, name: "Standard Lien-Only" },
  { id: "S-LO-BR3", vault: "0x060b5d11B1303FaB362bAF100EB37601F04C2AFD", marketId: "0xb992bed8501e65df324a530cf0aefc1f8f6928dcb18c8c44014f165138f92058", netYield: 8.01, name: "Standard Lien BR3" },
  { id: "S-LO-BR6", vault: "0x8Dfc0CaF025E62C634Ea179Ce04015f3ae51938a", marketId: "0x463ec5463398aafe277de322c600a3fd21ed4c9c24a395bc4c332043bfbf8cf1", netYield: 8.21, name: "Standard Lien BR6" },
  { id: "S-LO-BR12", vault: "0xbfc2B2ECF46b9b585199920d95F972E42DD23e51", marketId: "0xa25868c61830ab8fdb4d3c052881fcdc44b2847dc6e0bf3ae8b0e1238cd1e80c", netYield: 8.03, name: "Standard Lien BR12" },
  { id: "S-FC-NONE", vault: "0xef7EEeed223a45EB09808F98cA2B15cA16C7306D", marketId: "0xa215e2d5bf02bb47558b24ddb1f23c41d03dd257d3d371f9c0162abafdacc0c8", netYield: 7.72, name: "Standard Foreclosure" },
  { id: "S-FC-BR3", vault: "0x4d390F54327b8d4ca6DFaF8db58BCFdF0270697b", marketId: "0xc50b36a93f2d0315344f0de53665b7d795bc7b887a324ec0191c9a9e41570923", netYield: 7.50, name: "Standard FC BR3" },
  { id: "S-FC-BR6", vault: "0xE6dfc9b8057135165B1aAAA741FbbBe0aF416104", marketId: "0x3cff87edbc5b52ce33155df9503915f84a9f2515911d33430863c61d4442f1fb", netYield: 7.61, name: "Standard FC BR6" },
  { id: "S-FC-BR12", vault: "0x01EB25A573F1e86f46326B0DD1b4AB344ccB168E", marketId: "0x2f72395ca8aaaee20aad0a52c0ae379b76c47006d7b86c516c25d5fc46c6ccd7", netYield: 7.57, name: "Standard FC BR12" },
];

// MetaMorpho ERC4626 ABI — totalAssets for TVL
const ERC4626_ABI = [
  "function totalAssets() view returns (uint256)",
];

function calcSupplyApy(ratePerSecond, totalSupplyAssets, totalBorrowAssets, fee) {
  // Convert BigNumber to plain number for math
  const rate = parseFloat(ethers.utils.formatUnits(ratePerSecond, 18));
  const supply = parseFloat(totalSupplyAssets.toString());
  const borrow = parseFloat(totalBorrowAssets.toString());
  const feeRate = parseFloat(ethers.utils.formatUnits(fee, 18));

  // Compound annual borrow APY
  const borrowApy = (Math.pow(1 + rate, SECONDS_PER_YEAR) - 1) * 100;

  if (supply === 0) return 0;
  const utilization = borrow / supply;
  // Supply APY = borrowAPY * utilization * (1 - protocolFee)
  return borrowApy * utilization * (1 - feeRate);
}

async function apy() {
  const provider = new ethers.providers.JsonRpcProvider(BASE_RPC);
  const morpho = new ethers.Contract(MORPHO, MORPHO_ABI, provider);
  const irm = new ethers.Contract(IRM, IRM_ABI, provider);

  const pools = [];

  // Process vaults in batches of 6 to avoid RPC rate limits
  for (let i = 0; i < VAULTS.length; i += 6) {
    const batch = VAULTS.slice(i, i + 6);

    const results = await Promise.all(batch.map(async (v) => {
      try {
        const vault = new ethers.Contract(v.vault, ERC4626_ABI, provider);

        const [totalAssetsBN, marketData, marketParams] = await Promise.all([
          vault.totalAssets(),
          morpho.market(v.marketId),
          morpho.idToMarketParams(v.marketId),
        ]);

        const { totalSupplyAssets, totalBorrowAssets, fee } = marketData;
        const tvlUsd = parseFloat(ethers.utils.formatUnits(totalAssetsBN, 6));

        let apyBase = v.netYield; // modeled fallback

        // Only attempt IRM call if market has supply (avoids division by zero revert)
        if (totalSupplyAssets.gt(0)) {
          try {
            const ratePerSecond = await irm.borrowRateView(
              [marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv],
              [totalSupplyAssets, marketData.totalSupplyShares, totalBorrowAssets, marketData.totalBorrowShares, marketData.lastUpdate, fee]
            );
            const onChainApy = calcSupplyApy(ratePerSecond, totalSupplyAssets, totalBorrowAssets, fee);
            // If on-chain APY is reasonable (>0 and <100%), use it; else fall back to modeled yield
            if (onChainApy > 0 && onChainApy < 100) {
              apyBase = onChainApy;
            }
          } catch {
            // IRM call failed — stick with modeled netYield fallback
          }
        }

        return {
          pool: `${v.vault.toLowerCase()}-base`,
          chain: "Base",
          project: "unblock-equity",
          symbol: "USDC",
          tvlUsd,
          apyBase,
          underlyingTokens: [USDC],
          url: `https://app.unblockequity.com/earn`,
          poolMeta: v.name, // e.g. "Standard Lien BR12"
        };
      } catch (err) {
        // Return pool with fallback APY on any error — don't drop the vault from listing
        return {
          pool: `${v.vault.toLowerCase()}-base`,
          chain: "Base",
          project: "unblock-equity",
          symbol: "USDC",
          tvlUsd: 0,
          apyBase: v.netYield,
          underlyingTokens: [USDC],
          url: `https://app.unblockequity.com/earn`,
          poolMeta: v.name,
        };
      }
    }));

    pools.push(...results);

    // Delay between batches
    if (i + 6 < VAULTS.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: "https://app.unblockequity.com/earn",
};
