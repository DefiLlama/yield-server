const sdk = require('@defillama/sdk');
const axios = require('axios');

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

// 30 day reward window. Sonic settles roughly every 8 hours and Ethereum
// roughly daily so this captures a meaningful number of epochs on both chains.
const WINDOW_DAYS = 30;

// Conservative average block-time per chain (12 s on Ethereum, ~0.4 s on Sonic).
const BLOCKS_PER_DAY = {
  ethereum: 7200,
  sonic: 216000,
};

const CHAIN_LABEL = {
  ethereum: 'Ethereum',
  sonic: 'Sonic',
};

const apy = async () => {
  const ftPriceKey = `ethereum:${FT}`;
  const ftPriceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${ftPriceKey}`
  );
  const ftPrice = ftPriceResp.data.coins[ftPriceKey]?.price;
  if (!ftPrice || ftPrice <= 0) {
    throw new Error('Could not resolve FT price from coins.llama.fi');
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

    const latestBlock = (await sdk.api.util.getLatestBlock(chain)).number;
    const fromBlock = Math.max(
      0,
      latestBlock - BLOCKS_PER_DAY[chain] * WINDOW_DAYS
    );

    const logs = await sdk.getEventLogs({
      target: vault,
      eventAbi: EVENT_EPOCH_SETTLED,
      fromBlock,
      toBlock: latestBlock,
      chain,
    });

    let totalRewardWei = 0n;
    for (const log of logs) {
      totalRewardWei += BigInt(log.args.rewardAmount.toString());
    }
    const rewardFt = Number(totalRewardWei) / 1e18;
    const rewardUsd = rewardFt * ftPrice;

    let apyReward = 0;
    if (tvlUsd > 0 && rewardUsd > 0) {
      apyReward = (rewardUsd / tvlUsd) * (365 / WINDOW_DAYS) * 100;
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
      url: 'https://app.flyingtulip.com/',
    });
  }

  return pools;
};

module.exports = {
  apy,
  url: 'https://flyingtulip.com/',
};
