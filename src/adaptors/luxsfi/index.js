const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');
const superagent = require('superagent');

const utils = require('../utils')

const strategies = {
  polygon: [
    '0x819f6fBD91D99420794Adefdb1604Bfc3182AC39',
    '0x09104993F206cb53e7ac5dBC70DD974f68F1c407',
    '0xEDd43c446eA21a80eE388010d6db8EfbE366d604',
  ],
  arbitrum: [
    '0x0348Bb2730daC30966Ff15849ca6Ae24a93A59C1',
    '0x5125b6AB66dBAE17ded9841195b572f8c97592Ee',
    '0x705Aa351FB6c43547FC7E033732d07a9bfa20B1d',
  ],
  bsc: [
    '0x7455DF92B0Cd996906Da495724B4B27e8A4FFb21',
    '0xfE48c97F9AB4E65c567f53156f0988F36d97F9a5',
    '0x5339D0CE31A32e85cDa4E2002db48E3330baa212',
    '0xa50b3CF0Da6ffB01313eE94E762ea7AFeDB85965',
    '0x18d368Cc38c39efa7d645329aDfaF3ac55E75fCb',
  ],
  optimism: [
    '0x70DF1A862116b14fe21a5323f855E41d33E6CCf9',
    '0x09104993F206cb53e7ac5dBC70DD974f68F1c407',
    '0xEDd43c446eA21a80eE388010d6db8EfbE366d604',
    '0x819f6fBD91D99420794Adefdb1604Bfc3182AC39',
    '0xDD6427fc32992f57C86a6bDB0B5A7613cfF90813',
    '0x6b5b86eAf8EAe6f242F7065E4D3Fd114Ba67A594',
    '0x228E4bAf919EA6EDc4f06D9d336F59E08F1C1Bc1',
    '0x0930855b092B763279e3B49e61350d591bC62221',
    '0x353E9EE76A7Aebe020A7Fc814079b2d251038dcc',
    '0xf6BD394626dFc1aF214DEDf32a53DB2427C1b810',
    '0x5949Bc0ee0484835150e016d2381E62cfd42B430',
    '0x112cfdBDb520e6262F3B3CdB51033AEF2D9aE7Fd',
  ],
};

function ethersBNToBN(bn, decimals) {
  return new BigNumber(ethers.utils.formatUnits(bn, decimals));
}

function aprToAPY(apr, timesCompounded) {
  return apr.div(timesCompounded).plus(1).pow(timesCompounded).minus(1);
}

const getChainPools = async (chain, strategies) => {
  const aprs = await sdk.api.abi.multiCall({
    abi: abi.find((n) => n.name === 'averageAPRAcrossLastNHarvests'),
    calls: strategies.map((address) => ({
      target: address,
      params: [1],
    })),
    chain,
  });

  // -----====== Get Vault Addresses ======----- //
  const vaultsR = await sdk.api.abi.multiCall({
    abi: abi.find((n) => n.name === 'vault'),
    calls: strategies.map((address) => ({
      target: address,
    })),
    chain,
  });

  const vaults = vaultsR.output.map((vault) => vault.output.toLowerCase());

  // -----====== Get Token Addresses ======----- //
  let tokensR = await sdk.api.abi.multiCall({
    abi: abi.find((n) => n.name === 'token'),
    calls: vaults.map((address) => ({
      target: address,
    })),
    chain,
  });

  const tokens = tokensR.output.map((token) => token.output.toLowerCase());

  // -----====== Get Vault Info ======----- //
  const balancesR = await sdk.api.abi.multiCall({
    abi: abi.find((n) => n.name === 'totalBalance'),
    calls: vaults.map((address) => ({
      target: address,
    })),
    chain,
  });

  let priceKeys = [];
  const underlyingBalances = {};
  balancesR.output.map((balance, index) => {
    vaultAddr = balance.input.target.toLowerCase();
    tokenAddr = tokens[index];
    const priceKey = `${chain}:${tokenAddr}`;
    const underlyingTokens = `${vaultAddr}:${tokenAddr}`;

    priceKeys.includes(priceKey) ? null : priceKeys.push(priceKey);

    underlyingBalances[underlyingTokens] = balance.output;
  });

  const priceKeysQ = priceKeys.join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeysQ}`)
  ).body.coins;

  const apys = aprs.output.map((apr, index) => {
    const aprBN = ethersBNToBN(apr.output, 4);
    const apy = aprToAPY(aprBN, 365);
    return apy.multipliedBy(100);
  });

  const pools = strategies.map((address, index) => {
    const vaultAddr = vaults[index];
    const tokenAddr = tokens[index];

    const priceKey = `${chain}:${tokenAddr}`;
    const underlyingTokens = `${vaultAddr}:${tokenAddr}`;

    const symbol = prices[priceKey].symbol;
    const decimals = prices[priceKey].decimals;

    const balance = underlyingBalances[underlyingTokens];
    const tvlUsd =
      ethers.utils.formatUnits(balance, decimals) * prices[priceKey].price;

    const apr = aprs.output[index].output;
    const apy = apys[index];

    return {
      pool: `${vaultAddr}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'luxsfi',
      symbol: symbol,
      tvlUsd: tvlUsd,
      apy: apy.toNumber(),
      underlyingTokens: [tokenAddr],
    };
  });

  return pools;
};

const getPools = async () => {
  let pools = [];

  for (let chain in strategies) {
    const chainPools = await getChainPools(chain, strategies[chain]);
    pools = pools.concat(chainPools);
  }

  return pools.filter(p => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.luxs.fi',
};
