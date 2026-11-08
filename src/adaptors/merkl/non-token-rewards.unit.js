// node --test src/adaptors/merkl/non-token-rewards.unit.js
const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { getRewardApr } = require('./merkl-client');
const { addMerklRewardApy } = require('./merkl-additional-reward');
const { getMerklRewardsByIdentifier } = require('./merkl-by-identifier');

const VAULT = '0x00000000000000000000000000000000000000aa';
const USDC = '0x00000000000000000000000000000000000000b1';
const PIKU = '0x00000000000000000000000000000000000000b2';
const POINTS = '0x00000000000000000000000000000000000000b3';

const opportunity = (campaigns, { breakdowns = true } = {}) => ({
  id: '1',
  chainId: 1,
  identifier: VAULT,
  action: 'HOLD',
  tokens: [],
  apr: campaigns.reduce((acc, c) => acc + c.apr, 0),
  aprRecord: {
    breakdowns: breakdowns
      ? campaigns.map((c) => ({
          type: 'CAMPAIGN',
          identifier: c.id,
          value: c.apr,
        }))
      : [],
  },
  rewardsRecord: {
    breakdowns: campaigns.map((c) => ({
      onChainCampaignId: c.id,
      token: { address: c.token, type: c.type },
    })),
  },
});

const tokenAndPreTge = opportunity([
  { id: '0x01', apr: 4, type: 'TOKEN', token: USDC },
  { id: '0x02', apr: 25, type: 'PRETGE', token: PIKU },
]);
const nonTokenOnlyNoBreakdowns = opportunity(
  [
    { id: '0x03', apr: 5, type: 'POINT', token: POINTS },
    { id: '0x04', apr: 2, type: 'PRETGE', token: PIKU },
  ],
  { breakdowns: false }
);
const untyped = opportunity([{ id: '0x05', apr: 3, token: USDC }]);

const cases = [
  ['TOKEN + PRETGE counts only the TOKEN', tokenAndPreTge, 4, [USDC]],
  [
    'all POINT/PRETGE without breakdowns gives 0',
    nonTokenOnlyNoBreakdowns,
    0,
    undefined,
  ],
  ['missing type is kept', untyped, 3, [USDC]],
];

const serve = (data) => {
  axios.get = async () => ({ data });
};

for (const [name, opp, apr, rewardTokens] of cases) {
  test(name, async () => {
    assert.strictEqual(getRewardApr(opp), apr);

    serve([opp]);
    const [pool] = await addMerklRewardApy(
      [{ pool: VAULT, chain: 'ethereum' }],
      'x'
    );
    assert.strictEqual(pool.apyReward, apr || undefined);
    assert.deepStrictEqual(pool.rewardTokens, rewardTokens);

    serve([opp]);
    assert.deepStrictEqual(
      await getMerklRewardsByIdentifier(VAULT, 'ethereum'),
      apr ? { apyReward: apr, rewardTokens } : null
    );
  });
}
