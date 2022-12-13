const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const BIG_10 = new BigNumber(10);

const utils = require('../utils');
const { vaults, ChainId, FRONTEND } = require('./vaults');

const MAI_ID = 'mimatic';
const url = 'https://api.mai.finance/v2/vaultIncentives';
const qidao = '0xD694620D4621124F341951a2bae4C794baFD1723';

const VAULT = {
  abis: {
    totalSupply: {
      inputs: [],
      name: 'totalSupply',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    iR: {
      inputs: [],
      name: 'iR',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    getDebtCeiling: {
      inputs: [],
      name: 'getDebtCeiling',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    totalBorrowed: {
      inputs: [],
      name: 'totalBorrowed',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    _minimumCollateralPercentage: {
      inputs: [],
      name: '_minimumCollateralPercentage',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const chainIdMap = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
  metis: 1088,
};

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const main = async () => {
  const result = [];
  const vaultIncentives = (await utils.getData(url)).incentives;
  const incentives = Object.keys(vaultIncentives).flatMap(
    (e) => vaultIncentives[e]
  );

  for (const [index, chain] of Object.keys(ChainId).entries()) {
    const _vaultsInfo = vaults[ChainId[chain]].filter((e) => e.version === 2);
    const _chain = ChainId[chain];
    const totalSupplys = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ vaultAddress }) => ({
          target: vaultAddress,
        })),
        abi: VAULT.abis.totalSupply,
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const iRs = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ vaultAddress }) => ({
          target: vaultAddress,
        })),
        abi: VAULT.abis.iR,
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const getDebtCeilings = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ vaultAddress }) => ({
          target: vaultAddress,
        })),
        abi: VAULT.abis.getDebtCeiling,
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const totalBorroweds = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ vaultAddress }) => ({
          target: vaultAddress,
        })),
        abi: VAULT.abis.totalBorrowed,
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const balances = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ token, vaultAddress }) => ({
          target: token.address,
          params: [vaultAddress],
        })),
        abi: 'erc20:balanceOf',
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const ltv = (
      await sdk.api.abi.multiCall({
        calls: _vaultsInfo.map(({ token, vaultAddress }) => ({
          target: vaultAddress,
          params: null,
        })),
        abi: VAULT.abis._minimumCollateralPercentage,
        chain: _chain,
        requery: true,
      })
    ).output.map((x) => x.output);

    const coins_address = _vaultsInfo.map(
      (e) => `${_chain}:${e.token.address}`
    );
    const coins_id = [MAI_ID].map((e) => `coingecko:${e}`);
    const prices = (await utils.getPrices([...coins_address, ...coins_id]))
      .pricesByAddress;
    const _incentive = incentives.filter(
      (e) => Number(e.chainId) === chainIdMap[_chain]
    );

    const _result = _vaultsInfo.map((e, index) => {
      const tvlUsd = new BigNumber(balances[index])
        .div(BIG_10.pow(e.token.decimals))
        .times(prices[e.token.address.toLowerCase()]);
      const debtCeilingUsd = new BigNumber(getDebtCeilings[index])
        .div(BIG_10.pow(18))
        .times(prices[MAI_ID.toLowerCase()]);

      const totalBorrowUsd = new BigNumber(totalBorroweds[index])
        .div(BIG_10.pow(18))
        .times(prices[MAI_ID.toLowerCase()]);

      const apyCall = _incentive.find(
        (x) => x.vaultAddress.toLowerCase() === e.vaultAddress.toLowerCase()
      );

      const rewardTokens = [qidao];
      let apyRewardBorrow = Number(apyCall?.apr || '0');
      if (_chain === 'metis' && apyCall?.extraRewards?.length > 0) {
        const rewards = apyCall?.extraRewards[0];
        apyRewardBorrow += Number(rewards?.apr || '0');
        rewardTokens.push(rewards?.address);
      }

      const symbol = e.token.symbol;

      return {
        pool: `${e.vaultAddress}-${_chain}`,
        project: 'qidao',
        symbol: symbol === 'yvcurve-eth-steth' ? 'eth-steth' : symbol,
        poolMeta: symbol === 'yvcurve-eth-steth' ? 'Curve' : null,
        chain: _chain,
        apy: 0,
        tvlUsd: tvlUsd.toNumber(),
        // borrow fields
        apyBaseBorrow: Number(iRs[index]),
        // apyRewardBorrow, // ignoring this cause its only available within a specific range of collateral factor
        totalSupplyUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowUsd.toNumber(),
        debtCeilingUsd: totalBorrowUsd.plus(debtCeilingUsd).toNumber(),
        mintedCoin: 'MAI',
        ltv: (1 / ltv[index]) * 100,
      };
    });
    result.push(_result);
  }
  return result.flat().filter((e) => e.tvlUsd);
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://app.mai.finance/',
};
