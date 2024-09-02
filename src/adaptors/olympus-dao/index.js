const { gql, default: request } = require('graphql-request');
const sdk = require('@defillama/sdk');
const liquidityRegistry = require('./abis/liquidityRegistryAbi.json');
const vaultManager = require('./abis/vaultManagerAbi.json');
const utils = require('../utils');

const OLYMPUS_LIQUIDITY_REGISTRY = '0x375E06C694B5E50aF8be8FB03495A612eA3e2275';
const AURA_ADDRESS = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF'.toLowerCase();
const BAL_ADDRESS = '0xba100000625a3754423978a60c9317c58a424e3D'.toLowerCase();
const WSTETH_ADDRESS =
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'.toLowerCase();
const OHM_ADDRESS = '0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5';

const AURA_API =
  'https://graph.aura.finance/subgraphs/name/aura/aura-mainnet-v2';
const BAL_API = sdk.graph.modifyEndpoint('C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV');
const SWAP_APR_API = 'https://cache.aura.finance/aura/aprs-deprecated';
const AURA_TVL_API = 'https://cache.aura.finance/aura/tvl-deprecated';

const balBoolsQuery = gql`
  query Pools($address_in: [Bytes!] = "") {
    pools(where: { address_in: $address_in }) {
      id
      symbol
      address
      tokens {
        address
        token {
          symbol
        }
        cashBalance
        balance
        decimals
        symbol
      }
    }
  }
`;

const auraPoolsQuery = gql`
  query Pools($id: Int = 0) {
    pools(where: { id: $id }) {
      id
      lpToken {
        name
        symbol
        id
      }
      rewardData {
        rewardRate
        token {
          name
          id
        }
      }
      totalSupply
      totalStaked
      gauge {
        balance
        totalSupply
        workingSupply
      }
    }
  }
`;

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

const getAuraMintAmount = (balEarned, auraSupply) => {
  const auraUnitsMinted =
    (((500 - (auraSupply - 50000000) / 100000) * 2.5 + 700) / 500) * balEarned;
  return auraUnitsMinted;
};

/**
 * Return an array of active vault addresses
 */
const getActiveVaults = async () => {
  const activeVaultsCount = (
    await sdk.api.abi.call({
      target: OLYMPUS_LIQUIDITY_REGISTRY,
      abi: liquidityRegistry.find((n) => n.name === 'activeVaultCount'),
      chain: 'ethereum',
    })
  ).output;

  /* we only care about the count, so we can fill an array with 0s and map over it */
  const countArray = Array.from({ length: activeVaultsCount }).fill(0);

  const addresses = await Promise.all(
    countArray.map(async (value, position) => {
      const address = (
        await sdk.api.abi.call({
          target: OLYMPUS_LIQUIDITY_REGISTRY,
          abi: liquidityRegistry.find((n) => n.name === 'activeVaults'),
          params: position,
          chain: 'ethereum',
        })
      ).output;
      return address;
    })
  );
  return addresses;
};

const getAuraVaultTVL = async (vaultAddress, pairToken) => {
  const pricePerDepositToken =
    (
      await sdk.api.abi.call({
        target: vaultAddress,
        abi: vaultManager.find((n) => n.name === 'getExpectedLpAmount'),
        params: '1000000000000000000',
        chain: 'ethereum',
      })
    ).output / 1e18;

  const totalLp =
    (
      await sdk.api.abi.call({
        target: vaultAddress,
        abi: vaultManager.find((n) => n.name === 'totalLp'),
        chain: 'ethereum',
      })
    ).output / 1e18;

  const { pricesByAddress: prices } = await utils.getPrices(
    [pairToken, OHM_ADDRESS],
    'ethereum'
  );

  //Price for 1 LP Token in deposit token (converted to USD)
  const usdPricePerDepositToken =
    prices[pairToken.toLowerCase()] / pricePerDepositToken;

  //Price for 1 Deposit Token in OHM
  const ohmPricePerDepositToken =
    usdPricePerDepositToken / prices[OHM_ADDRESS.toLowerCase()];

  //Price for 1 OHM Deposit Token in USD
  const usdPricePerOhm =
    prices[OHM_ADDRESS.toLowerCase()] * ohmPricePerDepositToken;

  const lpTokenPrice = usdPricePerDepositToken + usdPricePerOhm;
  const tvlUsd = lpTokenPrice * totalLp;

  return tvlUsd;
};

/**
 * Use the same method as Aura to calculate the APY.
 * Return TVL of the Vault.
 * Boost the reward APY by 2 to account for single sided deposit.
 */
const getAuraAPY = async (address, swapAprs, prices, auraSupply) => {
  try {
    const auraPool = (
      await sdk.api.abi.call({
        target: address,
        abi: vaultManager.find((n) => n.name === 'auraData'),
        chain: 'ethereum',
      })
    ).output;

    const pairToken = (
      await sdk.api.abi.call({
        target: address,
        abi: vaultManager.find((n) => n.name === 'pairToken'),
        chain: 'ethereum',
      })
    ).output;

    const contractFee = (
      await sdk.api.abi
        .call({
          target: address,
          abi: vaultManager.find((n) => n.name === 'currentFee'),
          chain: 'ethereum',
        })
        .catch(() => {
          return { output: 0 }; //handle case of no fee
        })
    ).output;
    const fee = contractFee / 1e4;

    const { pools } = await request(AURA_API, auraPoolsQuery, {
      id: +auraPool.pid,
    });

    const pool = pools[0];

    const { pools: balPools } = await request(BAL_API, balBoolsQuery, {
      address_in: [pool.lpToken.id],
    });

    const balPool = balPools[0];
    if (!balPool) return;

    const swapApr = swapAprs.find(({ id }) => id === balPool.id);
    if (!swapApr?.poolAprs) return;

    const vaultTvlUsd = await getAuraVaultTVL(address, pairToken);

    const balRewards = pool.rewardData.find(
      ({ token }) => token.id === BAL_ADDRESS
    );

    const auraExtraRewards = pool.rewardData.find(
      ({ token }) => token.id === AURA_ADDRESS
    );
    const {
      balancer: { breakdown: auraTvl },
    } = await utils.getData(AURA_TVL_API);
    const tvlUsd = auraTvl[pool.lpToken.id] || 0;
    const balPerYear = (balRewards.rewardRate / 1e18) * SECONDS_PER_YEAR;
    const balFee = balPerYear * fee;
    const apyBal =
      ((balPerYear - balFee) / tvlUsd) * 100 * prices[BAL_ADDRESS] || 0;
    const auraPerYear = getAuraMintAmount(balPerYear, auraSupply);
    const auraFee = auraPerYear * fee;
    const apyAura =
      ((auraPerYear - auraFee) / tvlUsd) * 100 * prices[AURA_ADDRESS] || 0;
    const auraExtraApy = auraExtraRewards
      ? (((auraExtraRewards.rewardRate / 1e18) * SECONDS_PER_YEAR) / tvlUsd) *
        100 *
        prices[AURA_ADDRESS]
      : 0;
    //make sure to account for stETH rewards on certain pools
    const wstETHApy = swapApr.poolAprs.tokens.breakdown[WSTETH_ADDRESS] || 0;

    const rewardTokens = [BAL_ADDRESS, AURA_ADDRESS];

    return {
      pool: address,
      symbol: balPool.tokens.map(({ symbol }) => symbol).join('-'),
      chain: utils.formatChain('ethereum'),
      tvlUsd: vaultTvlUsd,
      apyBase: Number(swapApr.poolAprs.swap) + wstETHApy * 2, //boosted
      apyReward: (apyBal + apyAura + auraExtraApy) * 2, //boosted
      underlyingTokens: balPool.tokens.map(({ address }) => address),
      rewardTokens,
    };
  } catch (e) {
    console.log(e);
    return;
  }
};

/**
 * Olympus Boosted Liquidity Pools are single sided deposit pools.
 * Depositor deposits deposit token, Olympus matches deposit with OHM.
 * Rewards from underlying pool are 2x, due to the single sided deposit and match.
 */
const main = async () => {
  const addresses = await getActiveVaults();
  const { pools: swapAprs } = await utils.getData(SWAP_APR_API);
  const auraSupply =
    (
      await sdk.api.abi.call({
        target: AURA_ADDRESS,
        abi: 'erc20:totalSupply',
        chain: 'ethereum',
      })
    ).output / 1e18;
  const { pricesByAddress: prices } = await utils.getPrices(
    [AURA_ADDRESS, BAL_ADDRESS],
    'ethereum'
  );
  const apyInfo = await Promise.all(
    addresses.map(async (address) => {
      const info = await getAuraAPY(address, swapAprs, prices, auraSupply);
      return info ? { project: 'olympus-dao', ...info } : undefined;
    })
  );
  return apyInfo.filter((info) => info);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.olympusdao.finance/',
};
