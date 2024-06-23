const ADDRESSES = require('../assets.json')
const ADContractAbi = require('./abi/AcceleratingDistributor.json');

const SECONDS_PER_YEAR = 31557600; // 365.25 days per year

const contracts = {
  AcceleratedDistributor: {
    address: '0x9040e41ef5e8b281535a96d9a48acb8cfabd9a48',
    abi: ADContractAbi,
  },
};

const tokens = {
  WETH: {
    address: ADDRESSES.ethereum.WETH,
    lpAddress: '0x28f77208728b0a45cab24c4868334581fe86f95b',
  },
  USDC: {
    address: ADDRESSES.ethereum.USDC,
    lpAddress: '0xc9b09405959f63f72725828b5d449488b02be1ca',
  },
  USDT: {
    address: ADDRESSES.ethereum.USDT,
    lpAddress: '0xc2fab88f215f62244d2e32c8a65e8f58da8415a5',
  },
  WBTC: {
    address: ADDRESSES.ethereum.WBTC,
    lpAddress: '0x59c1427c658e97a7d568541dac780b2e5c8affb4',
  },
  DAI: {
    address: ADDRESSES.ethereum.DAI,
    lpAddress: '0x4fabacac8c41466117d6a38f46d08ddd4948a0cb',
  },
  ACX: {
    address: '0x44108f0223a3c3028f5fe7aec7f9bb2e66bef82f',
    lpAddress: '0xb0c8fef534223b891d4a430e49537143829c4817',
  },
  UMA: {
    address: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828',
    lpAddress: '0xb9921d28466304103a233fcd071833e498f12853',
  },
  BAL: {
    address: '0xba100000625a3754423978a60c9317c58a424e3d',
    lpAddress: '0xfacd2ec4647df2cb758f684c2aaab56a93288f9e',
  },
  SNX: {
    address: ADDRESSES.ethereum.SNX,
    lpAddress: '0xe480f5a42e263ac0352d0c9c6e75c4a612ee52a7',
  },
  POOL: {
    address: '0x0cec1a9154ff802e7934fc916ed7ca50bde6844e',
    lpAddress: '0xc3f35d90ebce372ded12029b72b22a23a2f637fd',
  }
};

module.exports = {
  SECONDS_PER_YEAR,
  contracts,
  tokens,
};
