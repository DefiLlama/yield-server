const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const SECONDS_PER_YEAR = 31536000;

const ROLES = {
  LENDER: 0,
  TRADER: 1
}

const CHAIN_IDS = {
  Polygon: 137,
};

const APYREWARD_BY_SYMBOL = {
  ['WETH']: 18,
  ['WBTC']: 1,
  ['USDC']: 31,
  ['USDT']: 20,
  ['WMATIC']: 21,
}

const APY_REWARD_BONUS = 7;

const config = [
  {
    chain: 'Polygon',
    lensAddress: '0xA37a23C5Eb527985caae2a710a0F0De7C49ACb9d',
    bucketsFactory: '0x7E6915D307F434E4171cCee90e180f5021c60089',
    positionManager: '0x02bcaA4633E466d151b34112608f60A82a4F6035',
    activityRewardDistributor: '0x156e2fC8e1906507412BEeEB6640Bf999a1Ea76b',
    EPMX: "0xDc6D1bd104E1efa4A1bf0BBCf6E0BD093614E31A",
    EPMXPriceFeed: "0x103A9FF33c709405DF58f8f209C53f6B5c5eA2BE",
    EPMXPriceFeedDecimals: 8,
  },
]

const getPoolUrl = (address, chain) => `https://app.primex.finance/#/bucket-details/${address}?network=${CHAIN_IDS[chain]}`

module.exports = { DEAD_ADDRESS, SECONDS_PER_YEAR, ROLES, CHAIN_IDS, APYREWARD_BY_SYMBOL, APY_REWARD_BONUS, config }