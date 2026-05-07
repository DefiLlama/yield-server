// UnblockEquity yield adapter for DefiLlama yield-server
// 24 MetaMorpho V2 vaults on Base — USDC lending against tokenized residential property liens
//
// TVL: live from each vault's totalAssets() (ERC4626 standard)
// APY: modeled equilibrium yield from each vault's risk model (PD × LGD → net yield).
//      Matches what depositors see in https://app.unblockequity.com/earn and what's
//      documented in the published risk whitepaper. Live IRM rates are intentionally
//      NOT used — Morpho's adaptive curve IRM drifts toward zero on idle markets,
//      which would misrepresent the long-run yield depositors actually earn.

const { ethers } = require("ethers");

const BASE_RPC = "https://mainnet.base.org";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// 24 vaults: id (verification-recovery-breathingRoom), vaultAddress, name, modeled net yield
const VAULTS = [
  { id: "V-LO-NONE", vault: "0x287397Fd29aBCdb1f514179099121895A2f5bEAF", netYield: 7.76, name: "Verified Lien-Only" },
  { id: "V-LO-BR3",  vault: "0x376736A69B8F9c350F76E0b2802466Eaee7E058f", netYield: 7.58, name: "Verified Lien BR3" },
  { id: "V-LO-BR6",  vault: "0xd6313868B5CeBAd6fDc3aE48F80917B385C01c71", netYield: 7.60, name: "Verified Lien BR6" },
  { id: "V-LO-BR12", vault: "0x2FFcbDEa42311515E3dB1F873A1Cea0D463B5Ced", netYield: 7.58, name: "Verified Lien BR12" },
  { id: "V-FC-NONE", vault: "0x0eD4c2cfff2Ec06079e723F51aeFC8cdF073ea68", netYield: 7.66, name: "Verified Foreclosure" },
  { id: "V-FC-BR3",  vault: "0x34dDd63FEA2868EeF439279D6FeCa7d5AcFc4F53", netYield: 7.61, name: "Verified FC BR3" },
  { id: "V-FC-BR6",  vault: "0xc24C630D27CBF1Da6A78B09821212eb9c5e1be40", netYield: 7.58, name: "Verified FC BR6" },
  { id: "V-FC-BR12", vault: "0x8E246a89a7F8ffD4efD7d037bD585F7741C0C482", netYield: 7.55, name: "Verified FC BR12" },
  { id: "P-LO-NONE", vault: "0x13D2E770cefB62A8Aa4e3393d59F88707AbD4dd5", netYield: 7.91, name: "Prime Lien-Only" },
  { id: "P-LO-BR3",  vault: "0xCc19805E91C66Ca6a3dd437E8F6d579ca9727804", netYield: 7.63, name: "Prime Lien BR3" },
  { id: "P-LO-BR6",  vault: "0x2018963CA1e5ACeb88B7fA8738e4AEC846beD752", netYield: 7.67, name: "Prime Lien BR6" },
  { id: "P-LO-BR12", vault: "0x618fFcf6fF74dC3766B892B7913BF5074B913eF2", netYield: 7.62, name: "Prime Lien BR12" },
  { id: "P-FC-NONE", vault: "0x12d6bA2c11Bbb96F8f91b0412593b87dB4E2ABE2", netYield: 7.70, name: "Prime Foreclosure" },
  { id: "P-FC-BR3",  vault: "0xFC274721AFdd37dB10419d08bd0db59E5Fcfb219", netYield: 7.64, name: "Prime FC BR3" },
  { id: "P-FC-BR6",  vault: "0x098A23332008Cffaf283E3b0e8EcDEcfDeb6849c", netYield: 7.60, name: "Prime FC BR6" },
  { id: "P-FC-BR12", vault: "0xf6EA5C33F0D33B56AAda9AF7Dd1C4203BB83C82F", netYield: 7.56, name: "Prime FC BR12" },
  { id: "S-LO-NONE", vault: "0x2BE1d9ddBbd70E7b148E8AdE884600268a0B28BD", netYield: 9.26, name: "Standard Lien-Only" },
  { id: "S-LO-BR3",  vault: "0x060b5d11B1303FaB362bAF100EB37601F04C2AFD", netYield: 8.01, name: "Standard Lien BR3" },
  { id: "S-LO-BR6",  vault: "0x8Dfc0CaF025E62C634Ea179Ce04015f3ae51938a", netYield: 8.21, name: "Standard Lien BR6" },
  { id: "S-LO-BR12", vault: "0x012f6f383F13BD437DFBfCBe94D1A8C5fC40E650", netYield: 8.03, name: "Standard Lien BR12" },
  { id: "S-FC-NONE", vault: "0xef7EEeed223a45EB09808F98cA2B15cA16C7306D", netYield: 7.72, name: "Standard Foreclosure" },
  { id: "S-FC-BR3",  vault: "0x4d390F54327b8d4ca6DFaF8db58BCFdF0270697b", netYield: 7.50, name: "Standard FC BR3" },
  { id: "S-FC-BR6",  vault: "0xE6dfc9b8057135165B1aAAA741FbbBe0aF416104", netYield: 7.61, name: "Standard FC BR6" },
  { id: "S-FC-BR12", vault: "0x01EB25A573F1e86f46326B0DD1b4AB344ccB168E", netYield: 7.57, name: "Standard FC BR12" },
];

const ERC4626_ABI = ["function totalAssets() view returns (uint256)"];

async function apy() {
  const provider = new ethers.providers.JsonRpcProvider(BASE_RPC);

  const pools = [];
  for (let i = 0; i < VAULTS.length; i += 6) {
    const batch = VAULTS.slice(i, i + 6);
    const results = await Promise.all(batch.map(async (v) => {
      let tvlUsd = 0;
      try {
        const totalAssets = await new ethers.Contract(v.vault, ERC4626_ABI, provider).totalAssets();
        tvlUsd = parseFloat(ethers.utils.formatUnits(totalAssets, 6));
      } catch {
        // Vault unreachable — list with zero TVL, modeled APY still informative
      }
      return {
        pool: `${v.vault.toLowerCase()}-base`,
        chain: "Base",
        project: "unblock-equity",
        symbol: "USDC",
        tvlUsd,
        apyBase: v.netYield,
        underlyingTokens: [USDC],
        url: "https://app.unblockequity.com/earn",
        poolMeta: v.name,
      };
    }));
    pools.push(...results);
    if (i + 6 < VAULTS.length) await new Promise((r) => setTimeout(r, 300));
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: "https://app.unblockequity.com/earn",
};
