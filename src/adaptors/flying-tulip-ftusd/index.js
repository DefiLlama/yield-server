const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

// Flying Tulip ftUSD — yield-bearing stablecoin staked into sftUSD.
// Reward stream: protocol uses the fees collected by the ftUSD MintAndRedeem
// engine to buy FT on the open market and distributes it to sftUSD stakers per
// epoch through the EpochRewardsVault. FT total supply is fixed; nothing is
// minted, so the reward APY is fully economic, not emission-driven.
//
// Sources:
//   - https://api.flyingtulip.com/ftusd/contracts/all
//   - https://flyingtulipdotcom.github.io/deployments/prod-eth-ftusd.toon
//   - https://flyingtulipdotcom.github.io/deployments/prod-sonic-ftusd.toon

const SFT_USD = {
  ethereum: '0xeb48218a4c35C814C7678cBcae88C6Ee037F7625',
  sonic: '0xD1E5A86f1005F6356Bd022C587dE0f430CD2aeb1',
};

// ftUSD is a CREATE2-deterministic deployment so the address is identical on
// every supported chain.
const FTUSD = '0xF7D85EC4E7710f71992752eac2111312e73E9C9C';

// FT reward token. Same address on Ethereum and Sonic per the on-chain
// EpochRewardsVault.FT() reference.
const FT = '0x5DD1A7A369e8273371d2DBf9d83356057088082c';

const EVENT_EPOCH_SETTLED =
  'event EpochSettled(uint32 indexed epochId, uint256 rewardAmount, uint256 stakeTime, uint256 rateRay)';

// 30 day reward window. The start block is resolved from the chain's own
// timestamps via lookupBlock rather than an assumed block-time, so it is a true
// 30 days on every chain regardless of block cadence, and the result is
// annualized by the actual elapsed time of that window.
const WINDOW_DAYS = 30;
const SECONDS_PER_DAY = 86400;

const CHAIN_LABEL = {
  ethereum: 'Ethereum',
  sonic: 'Sonic',
};

const apy = async () => {
  // FT price is fetched best effort. If coins.llama.fi misses or returns 0 the
  // price is unknown, so apyReward is reported as null (rewards can't be
  // valued) rather than 0 (which would assert there were no rewards).
  let ftPrice = null;
  try {
    const ftPriceKey = `ethereum:${FT}`;
    const resp = await axios.get(
      getPriceApiUrl(`/prices/current/${ftPriceKey}`)
    );
    const candidate = resp.data?.coins?.[ftPriceKey]?.price;
    if (typeof candidate === 'number' && candidate > 0) ftPrice = candidate;
  } catch (_) {
    ftPrice = null;
  }

  const pools = [];
  for (const chain of Object.keys(SFT_USD)) {
    const vault = SFT_USD[chain];

    // sftUSD is an ERC4626 with 1:1 share-to-asset ratio (no pricePerShare
    // growth) so totalSupply equals the staked ftUSD assets, which is
    // dollar-pegged and 6-decimal. tvlUsd = totalSupply / 1e6.
    const totalSupply = (
      await sdk.api.abi.call({
        target: vault,
        abi: 'erc20:totalSupply',
        chain,
      })
    ).output;
    const tvlUsd = Number(totalSupply) / 1e6;

    const latestBlock = await sdk.api.util.getLatestBlock(chain);
    const windowStart = latestBlock.timestamp - WINDOW_DAYS * SECONDS_PER_DAY;
    const fromBlock = await sdk.api.util.lookupBlock(windowStart, { chain });
    const elapsedDays =
      (latestBlock.timestamp - fromBlock.timestamp) / SECONDS_PER_DAY;

    const logs = await sdk.getEventLogs({
      target: vault,
      eventAbi: EVENT_EPOCH_SETTLED,
      fromBlock: fromBlock.block,
      toBlock: latestBlock.number,
      chain,
    });

    let totalRewardWei = 0n;
    for (const log of logs) {
      totalRewardWei += BigInt(log.args.rewardAmount.toString());
    }
    // Scale wei down to FT in the BigInt domain first to keep precision.
    // 30 days of rewards on Ethereum is on the order of 1e22 wei, well above
    // the 2^53 safe integer limit, so a direct Number(totalRewardWei) cast
    // would lose several digits and skew the APY.
    const FT_DECIMALS = 18n;
    const PRECISION = 6n; // 1e6 FT-units of precision in the final number
    const scaled = totalRewardWei / 10n ** (FT_DECIMALS - PRECISION);
    const rewardFt = Number(scaled) / Number(10n ** PRECISION);

    // Missing price => apyReward null (rewards can't be valued). Price known
    // but no/zero rewards => apyReward 0 (genuinely no yield this window).
    let apyReward = null;
    if (ftPrice !== null) {
      const rewardUsd = rewardFt * ftPrice;
      apyReward =
        tvlUsd > 0 && rewardUsd > 0 && elapsedDays > 0
          ? (rewardUsd / tvlUsd) * (365 / elapsedDays) * 100
          : 0;
    }

    pools.push({
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: CHAIN_LABEL[chain],
      project: 'flying-tulip-ftusd',
      symbol: 'sftUSD',
      tvlUsd,
      apyReward,
      rewardTokens: [FT],
      underlyingTokens: [FTUSD],
      poolMeta: 'staked ftUSD (FT rewards bought on open market)',
      url: 'https://flyingtulip.com/ftusd/',
    });
  }

  return pools;
};

module.exports = {
  protocolId: '7759',
  apy,
  url: 'https://flyingtulip.com/ftusd/',
};
