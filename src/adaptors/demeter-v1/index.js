const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const {getDemeterFarms} = require('./subgraph');
// const { comptrollerAbi, ercDelegator } = require('../sperax/abi');

const COMPTROLLER_ADDRESS = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';
const CHAIN = 'arbitrum';
const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'compSupplySpeeds';
const REWARD_SPEED_BORROW = 'compBorrowSpeeds';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CHASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 86400 / 12;
const PROJECT_NAME = 'demeter';
const NATIVE_TOKEN = {
    decimals: 18,
    symbol: 'SPA',
    address: '0x5575552988A3A80504bBaeB1311674fCFd40aD4B'.toLowerCase(),
  };
  module.exports = {
    timetravel: false,
    apy: getDemeterFarms,
    url: 'https://app.3xcalibur.com/swap/liquidity/add',
  };
  // const getPrices = async (addresses) => {
  //   const prices = (
  //     await superagent.get(
  //       `https://coins.llama.fi/prices/current/${addresses
  //         .join(',')
  //         .toLowerCase()}`
  //     )
  //   ).body.coins;
  
  //   const pricesByAddress = Object.entries(prices).reduce(
  //     (acc, [name, price]) => ({
  //       ...acc,
  //       [name.split(':')[1]]: price.price,
  //     }),
  //     {}
  //   );
  
  //   return pricesByAddress;
  // };
  // const calculateApy = (ratePerTimestamps) => {
  //   const blocksPerDay = BLOCKS_PER_DAY;
  //   const daysPerYear = 365;
  
  //   return (
  //     (Math.pow(ratePerTimestamps * blocksPerDay + 1, daysPerYear) - 1) * 100
  //   );
  // };
  