const FeeSplitterContractAbi = require('./abi/FeeSplitter.json');

const contracts = {
  FeeSplitter: {
    address: "0x02473349D9e2AbbFcF5b82F171b55Cd694f9Fc7A",
    abi: FeeSplitterContractAbi,
  },
};

const tokens = {
  MORE: "0x25ea98ac87A38142561eA70143fd44c4772A16b6",
  sMORE: "0xD1e39288520f9f3619714B525e1fD5F8c023dbA1",
};

module.exports = {
  contracts,
  tokens,
};
