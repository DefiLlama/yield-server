const sdk = require('@defillama/sdk');
const utils = require('../utils');

const VAULTS = {
  base: {
    address: '0x1688aeb3ec7b23a22e2418fdf5bccc67ecf39c0f',
    symbol: 'USDC',
    underlying: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingDecimals: 6,
    yieldSource: '0x0a1a3b5f2041f33522c4efc754a7d096f880ee16',
  },
  arbitrum: {
    address: '0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb',
    symbol: 'USDC',
    underlying: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    underlyingDecimals: 6,
    yieldSource: '0x44c10da836d2abe881b77bbb0b3dce5f85c0c1cc',
  },
  katana: {
    address: '0xe5092ab6b8b0c37b1bec12c606614706063d04e8',
    symbol: 'vbUSDC',
    underlying: '0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36',
    underlyingDecimals: 6,
    yieldSource: '0xE4248e2105508FcBad3fe95691551d1AF14015f7',
  },
  monad: {
    address: '0xE89d322b5822D828B8252D3087be8486cC2048Ef',
    symbol: 'AUSD',
    underlying: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    underlyingDecimals: 6,
    yieldSource: null,
  },
  hyperliquid: {
    address: '0x00a7ab758367da6a3909b75bd30ccc68e8755809',
    symbol: 'WHYPE',
    underlying: '0x5555555555555555555555555555555555555555',
    underlyingDecimals: 18,
    yieldSource: '0x2900abd73631b2f60747e687095537b673c06a76',
  },
};

const SET_MERKLE_ROOTS_ABI =
  'event SetMerkleRoots(uint256 indexed payoutId, bytes32 indexed participantsRoot, bytes32 indexed designatedRecipientsRoot, uint256 designatedRecipientsCount, uint256 totalTickets, uint256 totalPayoutAmount)';
const PAYOUT_POOL_ABI =
  'function payoutPool(uint256) view returns (bool canceled, uint8 designatedRecipientsCount, uint8 claimCount, uint256 claimMask, uint256 totalPayoutAmount, uint256 remainingPayoutAmount, uint256 totalTickets, bytes32 participantsRoot, bytes32 designatedRecipientsRoot, tuple(bytes32 proof, bytes32 seed, bytes32 publicKey, bytes32 vrfHash) vrfProofDetails)';
const TOTAL_ASSETS_ABI = 'uint256:totalAssets';

const SECONDS_PER_DAY = 86400;
const WINDOW_DAYS = 30;
const WINDOW_SECONDS = WINDOW_DAYS * SECONDS_PER_DAY;

const getRealizedPrizeData = async (chain, vault) => {
  const latest = await sdk.api.util.getLatestBlock(chain);
  const cutoffTimestamp = latest.timestamp - WINDOW_SECONDS;
  const past = await sdk.api.util.lookupBlock(cutoffTimestamp, { chain });

  const [totalAssetsRes, setLogs] = await Promise.all([
    sdk.api.abi.call({
      target: vault.address,
      chain,
      abi: TOTAL_ASSETS_ABI,
    }),
    sdk.getEventLogs({
      target: vault.address,
      chain,
      fromBlock: past.block,
      toBlock: latest.number,
      eventAbi: SET_MERKLE_ROOTS_ABI,
    }),
  ]);

  const scale = 10 ** vault.underlyingDecimals;
  const tvlUnderlying = Number(totalAssetsRes.output) / scale;

  if (!setLogs.length || !tvlUnderlying) {
    return { apyBase: null, tvlUnderlying };
  }

  const ids = setLogs.map((log) => log.args.payoutId.toString());
  const poolsRes = await sdk.api.abi.multiCall({
    chain,
    abi: PAYOUT_POOL_ABI,
    calls: ids.map((id) => ({ target: vault.address, params: [id] })),
    permitFailure: true,
  });

  let sumPayout = 0;
  for (let i = 0; i < setLogs.length; i++) {
    const r = poolsRes.output[i];
    if (!r?.success || !r.output) continue;
    const canceled = r.output.canceled ?? r.output[0];
    if (canceled) continue;
    sumPayout += Number(setLogs[i].args.totalPayoutAmount.toString()) / scale;
  }

  if (!sumPayout) return { apyBase: null, tvlUnderlying };

  const annualization = (365 * SECONDS_PER_DAY) / WINDOW_SECONDS;
  const apyBase = (sumPayout / tvlUnderlying) * annualization * 100;
  return { apyBase, tvlUnderlying };
};

const buildPool = async (chain, vault) => {
  try {
    const { apyBase: realizedApy, tvlUnderlying } =
      await getRealizedPrizeData(chain, vault);

    let apyBase = realizedApy;
    if ((apyBase === null || !Number.isFinite(apyBase)) && vault.yieldSource) {
      const yieldInfo = await utils.getERC4626Info(
        vault.yieldSource,
        chain,
        undefined,
        { assetUnit: '1000000000000000000' }
      );
      apyBase = yieldInfo.apyBase;
    }

    const { pricesByAddress } = await utils.getPrices([vault.underlying], chain);
    const price = pricesByAddress[vault.underlying.toLowerCase()];
    if (!price) return null;

    return {
      pool: `${vault.address}-${chain}`,
      chain: utils.formatChain(chain),
      project: 'ample',
      symbol: vault.symbol,
      tvlUsd: tvlUnderlying * price,
      apyBase,
      underlyingTokens: [vault.underlying],
      url: 'https://ample.money/',
    };
  } catch (err) {
    console.error(`ample ${chain} error:`, err.message);
    return null;
  }
};

const apy = async () => {
  const pools = await Promise.all(
    Object.entries(VAULTS).map(([chain, vault]) => buildPool(chain, vault))
  );
  return pools.filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://ample.money/',
};
