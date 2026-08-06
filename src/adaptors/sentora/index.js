const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SENTORA_VAULTS_API = 'https://services.vaults.sentora.com/vaults';
const KAMINO_API = 'https://api.kamino.finance';

const MIN_TVL_USD = 1000;
const ETHEREUM_CHAIN_ID = '1';
const LOOKBACK_DAYS = 7;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

const HOST_TRACKED_PROTOCOLS = new Set(['morpho', 'eulerv2']);

const KAMINO_FARMS_PROGRAM = 'FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr';
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);

const KAMINO_VAULT_STATE_FARM_OFFSET = 58600;
const KAMINO_FARM_STATE_REWARD_MINT_OFFSET = 192;
const PUBKEY_BYTES = 32;
const DEFAULT_PUBKEY = '1'.repeat(PUBKEY_BYTES);

const readPubkeyAt = (address, offset) =>
  utils.getSolanaAccount(address, {
    dataSlice: { offset, length: PUBKEY_BYTES },
  });

const getFarmRewardToken = async (vaultAddress) => {
  const vault = await readPubkeyAt(vaultAddress, KAMINO_VAULT_STATE_FARM_OFFSET);
  if (!vault) return null;

  const farmAddress = utils.toBase58(vault.data);
  if (farmAddress === DEFAULT_PUBKEY) return null;

  const farm = await readPubkeyAt(
    farmAddress,
    KAMINO_FARM_STATE_REWARD_MINT_OFFSET
  );
  if (farm?.owner !== KAMINO_FARMS_PROGRAM) return null;

  const mintAddress = utils.toBase58(farm.data);
  const mint = await utils.getSolanaAccount(mintAddress, {
    dataSlice: { offset: 0, length: 0 },
  });

  return TOKEN_PROGRAMS.has(mint?.owner) ? mintAddress : null;
};

const getTotalAssetsAbi = {
  inputs: [],
  name: 'getTotalAssets',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getSharePriceAbi = {
  inputs: [],
  name: 'getSharePrice',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const multiCall = (calls, abi, block) =>
  sdk.api.abi.multiCall({
    calls,
    abi,
    chain: 'ethereum',
    permitFailure: true,
    ...(block && { block }),
  });

const getEthereumVaultData = async (vaults) => {
  const byVault = {};
  if (!vaults.length) return byVault;

  const calls = vaults.map((v) => ({ target: v.address }));
  const lookbackSeconds = LOOKBACK_DAYS * SECONDS_PER_DAY;
  const [priorBlock] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - lookbackSeconds],
    'ethereum'
  );

  const [assets, totalAssets, sharePrice, priorSharePrice] = await Promise.all([
    multiCall(calls, 'address:asset'),
    multiCall(calls, getTotalAssetsAbi),
    multiCall(calls, getSharePriceAbi),
    multiCall(calls, getSharePriceAbi, priorBlock),
  ]);

  const underlyingTokens = assets.output.map((o) => o.output);
  const knownTokens = [...new Set(underlyingTokens.filter(Boolean))];
  if (!knownTokens.length) return byVault;

  const tokenCalls = knownTokens.map((t) => ({ target: t }));
  const [symbols, decimals, prices] = await Promise.all([
    multiCall(tokenCalls, 'erc20:symbol'),
    multiCall(tokenCalls, 'erc20:decimals'),
    utils.getPrices(knownTokens, 'ethereum'),
  ]);

  const tokenInfo = {};
  knownTokens.forEach((token, i) => {
    const tokenDecimals = decimals.output[i].output;
    tokenInfo[token] = {
      symbol: symbols.output[i].output,
      decimals: tokenDecimals == null ? null : Number(tokenDecimals),
      price: prices.pricesByAddress[token.toLowerCase()],
    };
  });

  vaults.forEach((vault, i) => {
    const token = underlyingTokens[i];
    const info = tokenInfo[token];
    if (!info || !Number.isFinite(info.decimals) || !info.symbol || !info.price)
      return;

    const held = totalAssets.output[i].output;
    const current = Number(sharePrice.output[i].output);
    const prior = Number(priorSharePrice.output[i].output);
    if (held == null || !(current > 0) || !(prior > 0)) return;

    const scale = 10 ** info.decimals;
    byVault[vault.address] = {
      symbol: info.symbol,
      underlyingToken: token,
      tvlUsd: (Number(held) / scale) * info.price,
      pricePerShare: current / scale,
      apyBase:
        (Math.pow(current / prior, SECONDS_PER_YEAR / lookbackSeconds) - 1) *
        100,
    };
  });

  return byVault;
};

const basePool = (vault, chain) => ({
  pool: `${vault.address}-${chain}`,
  chain,
  project: 'sentora',
  poolMeta: vault.name,
  url: vault.landingUrl,
});

const buildEthereumPool = (vault, onchain) => {
  if (!onchain) {
    console.log(`sentora: no on-chain data for ${vault.address}, skipping`);
    return null;
  }

  return {
    ...basePool(vault, 'Ethereum'),
    symbol: onchain.symbol,
    tvlUsd: onchain.tvlUsd,
    apyBase: onchain.apyBase,
    pricePerShare: onchain.pricePerShare,
    underlyingTokens: [onchain.underlyingToken],
  };
};

const buildKaminoPool = async (vault) => {
  const { data: metrics } = await axios.get(
    `${KAMINO_API}/kvaults/${vault.address}/metrics?env=mainnet-beta`
  );

  const pool = {
    ...basePool(vault, 'Solana'),
    symbol: vault.depositToken.symbol,
    tvlUsd: Number(vault.analytics.tvlUsd),
    apyBase: Number(metrics.apy) * 100,
    pricePerShare: Number(metrics.sharePrice),
    underlyingTokens: [vault.depositToken.address],
  };

  const apyFarmRewards = Number(metrics.apyFarmRewards) * 100;
  if (!(apyFarmRewards > 0)) return pool;

  const rewardToken = await getFarmRewardToken(vault.address);
  if (!rewardToken) {
    throw new Error(
      `unresolved farm reward token for ${vault.address} paying ${apyFarmRewards}% apy`
    );
  }

  pool.apyReward = apyFarmRewards;
  pool.rewardTokens = [rewardToken];
  return pool;
};

const apy = async () => {
  const { data } = await axios.get(SENTORA_VAULTS_API);
  const vaults = (Array.isArray(data) ? data : data.vaults || []).filter(
    (v) =>
      v.status === 'ACTIVE' &&
      !HOST_TRACKED_PROTOCOLS.has(v.protocol) &&
      v.depositToken?.address &&
      v.landingUrl &&
      Number(v.analytics?.tvlUsd) >= MIN_TVL_USD
  );

  const isEthereum = (v) => v.blockchain?.chainId === ETHEREUM_CHAIN_ID;
  const onchain = await getEthereumVaultData(vaults.filter(isEthereum));

  const pools = await Promise.all(
    vaults
      .filter((v) => isEthereum(v) || v.protocol === 'kamino')
      .map((v) =>
        isEthereum(v)
          ? buildEthereumPool(v, onchain[v.address])
          : buildKaminoPool(v)
      )
  );

  return pools.filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '6807',
  timetravel: false,
  apy,
  url: 'https://vaults.sentora.com/',
};
