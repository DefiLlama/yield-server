const ADContractAbi = require('./abi/AcceleratingDistributor.json');

const SECONDS_PER_YEAR = 31557600; // 365.25 days per year

const contracts = {
  'AcceleratedDistributor': {
    address: '0x9040e41ef5e8b281535a96d9a48acb8cfabd9a48',
    abi: ADContractAbi,
  },
};

const tokens = {
  WETH: {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    lpAddress: '0x28f77208728b0a45cab24c4868334581fe86f95b',
  },
  USDC: {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    lpAddress: '0xc9b09405959f63f72725828b5d449488b02be1ca',
  },
  WBTC: {
    address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    lpAddress: '0x59c1427c658e97a7d568541dac780b2e5c8affb4',
  },
  DAI: {
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    lpAddress: '0x4fabacac8c41466117d6a38f46d08ddd4948a0cb',
  },
  ACX: {
    address: '0x44108f0223a3c3028f5fe7aec7f9bb2e66bef82f',
    lpAddress: '0xb0c8fef534223b891d4a430e49537143829c4817',
 },
};

module.exports = {
  SECONDS_PER_YEAR,
  contracts,
  tokens,
};
