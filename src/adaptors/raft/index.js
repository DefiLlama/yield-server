const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const RR = '0x2ba26baE6dF1153e29813d7f926143f9c94402f3';
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;

async function apy() {
  const issuanceRate = await sdk.api.abi.call({
    target: RR,
    abi: {
      inputs: [],
      name: 'issuanceRate',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
  });
  const totalAssets = await sdk.api.abi.call({
    target: RR,
    abi: {
      inputs: [],
      name: 'totalAssets',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
    },
  });

  const apy = BigNumber(issuanceRate.output)
    .times(SECONDS_PER_YEAR)
    .div(1e18)
    .toNumber();
  const tvlUsd = BigNumber(totalAssets.output).div(1e18).toNumber();

  return [
    {
      pool: RR,
      project: 'raft',
      symbol: 'R',
      chain: 'ethereum',
      poolMeta: 'R Savings Rate',
      apy,
      tvlUsd,
    },
  ];
}

module.exports = {
  apy,
  url: 'https://app.raft.com/savings',
};
