const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CHAIN = 'base';
const HRUSD = '0x5587AD03F9565F1B86cfA51a3C744Bcc4039dAf0';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const POOL = '0xAE2E818A18e95212FAE482e2180bC89546393DC9';
const POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

// Both V3LPStakingRewards deployments escrow HRUSD/USDC position NFTs and accrue
// rewards on the same terms. The legacy one still holds stakes, so it is included.
const STAKERS = [
  '0xb72f376ae7732a76F1C18e0547553A616a33a2bd',
  '0xA61C08DeC414416E55de7b4510bA8Ef25C89886a',
];

const ABI = {
  aprBps: 'uint256:aprBps',
  bpsDenominator: 'uint256:BPS_DENOMINATOR',
  balanceOf: 'erc20:balanceOf',
  tokenOfOwnerByIndex:
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  previewAmounts:
    'function previewAmounts(uint256 tokenId) view returns (uint256 amt0, uint256 amt1, uint256 principalHrusd)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
};

// HRUSD has no price feed on DefiLlama, so it is valued against USDC from its own
// Uniswap V3 pool — the same source the staking contract reads for principal.
const getHrusdPrice = async (api) => {
  const [slot0, usdc] = await Promise.all([
    api.call({ abi: ABI.slot0, target: POOL }),
    utils.getData(`https://coins.llama.fi/prices/current/${CHAIN}:${USDC}`),
  ]);
  const usdcPrice = Object.values(usdc.coins)[0]?.price;
  if (!usdcPrice) throw new Error('hrusd: missing USDC price');
  // HRUSD is token0, USDC is token1, both 6 decimals
  const hrusdInUsdc = (Number(slot0.sqrtPriceX96) / 2 ** 96) ** 2;
  return hrusdInUsdc * usdcPrice;
};

// Rewards accrue linearly on `principalHrusd`, the HRUSD-denominated value of each
// staked position, so the pool's TVL is the sum of those principals.
const getStakedPrincipal = async (api) => {
  const counts = await api.multiCall({
    abi: ABI.balanceOf,
    target: POSITION_MANAGER,
    calls: STAKERS.map((owner) => ({ params: [owner] })),
  });

  const idCalls = [];
  STAKERS.forEach((owner, i) => {
    for (let j = 0; j < Number(counts[i]); j += 1)
      idCalls.push({ owner, params: [owner, j] });
  });
  if (!idCalls.length) return 0;

  const tokenIds = await api.multiCall({
    abi: ABI.tokenOfOwnerByIndex,
    target: POSITION_MANAGER,
    calls: idCalls.map(({ params }) => ({ params })),
  });

  const previews = await Promise.all(
    STAKERS.map((staker) => {
      const calls = idCalls
        .map(({ owner }, k) => (owner === staker ? { params: [tokenIds[k]] } : null))
        .filter(Boolean);
      if (!calls.length) return [];
      return api.multiCall({
        abi: ABI.previewAmounts,
        target: staker,
        calls,
        permitFailure: true,
      });
    })
  );

  return previews
    .flat()
    .filter(Boolean)
    .reduce((acc, p) => acc + Number(p.principalHrusd) / 1e6, 0);
};

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });

  const [aprBps, denominators] = await Promise.all([
    api.multiCall({ abi: ABI.aprBps, calls: STAKERS.map((target) => ({ target })) }),
    api.multiCall({ abi: ABI.bpsDenominator, calls: STAKERS.map((target) => ({ target })) }),
  ]);

  // Lower bound across deployments, per the repo's unboosted-value rule. No haircut
  // is applied for early exit: the exit fee is set to zero, and no ExitFeesPaid event
  // has ever fired on the current deployment (the legacy one charged 0.98 HRUSD in
  // total over its lifetime). Unstaking is subject to a 24h delay, not a penalty.
  const apyReward = Math.min(
    ...aprBps.map((bps, i) => (Number(bps) / Number(denominators[i])) * 100)
  );

  const [principalHrusd, hrusdPrice] = await Promise.all([
    getStakedPrincipal(api),
    getHrusdPrice(api),
  ]);

  return [
    {
      pool: `${POOL}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'hrusd',
      symbol: utils.formatSymbol('HRUSD-USDC'),
      tvlUsd: principalHrusd * hrusdPrice,
      apyReward,
      rewardTokens: [HRUSD],
      underlyingTokens: [HRUSD, USDC],
      token: POOL,
      poolMeta: 'Uniswap V3 LP staking',
      url: 'https://hyperoute.xyz/',
    },
  ];
};

module.exports = {
  protocolId: '8458',
  timetravel: false,
  apy,
  url: 'https://hyperoute.xyz/',
};
