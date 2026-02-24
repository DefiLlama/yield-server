const axios = require('axios');

const VOTE_ACCOUNT = 'TRAMp1Z9EXyWQQNwNjjoNvVksMUHKioVU7ky61yNsEq';
const SOL = 'So11111111111111111111111111111111111111112';
const solKey = `solana:${SOL}`;
const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Tramplin validator has 100% commission; protocol redistributes 70% to users
const USER_REWARD_SHARE = 0.7;
const SOLANA_GENESIS_MS = Date.UTC(2020, 2, 16);
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

const rpc = (method, params = []) =>
  axios.post(
    RPC_URL,
    { jsonrpc: '2.0', id: 1, method, params },
    { headers: { 'Content-Type': 'application/json' } }
  );

const apy = async () => {
  const [voteRes, priceRes, epochRes] = await Promise.all([
    rpc('getVoteAccounts', [{ votePubkey: VOTE_ACCOUNT }]),
    axios.get(`https://coins.llama.fi/prices/current/${solKey}`),
    rpc('getEpochInfo'),
  ]);

  const validator =
    voteRes.data.result.current?.[0] ||
    voteRes.data.result.delinquent?.[0];
  if (!validator) throw new Error('Tramplin validator not found');
  const stakedSol = validator.activatedStake / 1e9;
  if (!stakedSol || !isFinite(stakedSol))
    throw new Error('Tramplin validator has no activated stake');

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  // Fetch actual inflation reward for the last completed epoch
  const lastEpoch = epochRes.data.result.epoch - 1;
  const rewardRes = await rpc('getInflationReward', [
    [VOTE_ACCOUNT],
    { epoch: lastEpoch },
  ]);

  const reward = rewardRes.data.result?.[0];
  if (!reward) throw new Error('Unable to fetch epoch reward');

  const epochRewardSol = reward.amount / 1e9;
  const currentEpoch = epochRes.data.result.epoch;
  const yearsSinceGenesis = (Date.now() - SOLANA_GENESIS_MS) / MS_PER_YEAR;
  const epochsPerYear = currentEpoch / yearsSinceGenesis;

  // Compound APY from actual validator rewards, adjusted for 70% user share
  const epochRate = (epochRewardSol / stakedSol) * USER_REWARD_SHARE;
  const apyBase = (Math.pow(1 + epochRate, epochsPerYear) - 1) * 100;

  return [
    {
      pool: VOTE_ACCOUNT,
      chain: 'Solana',
      project: 'tramplin.io',
      symbol: 'SOL',
      tvlUsd: stakedSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      poolMeta: '70% of rewards via lottery',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://tramplin.io',
};
