const axios = require('axios');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const Web3 = require('web3');

const { UMAMI_ALL_VAULTS, UMAMI_API_URL } = require('./umamiConstants');
const vaultAbi = require('./abis/glpVault.json');
const utils = require('../utils');

const RPC_URL = 'https://arb-mainnet-public.unifra.io';

const web3 = new Web3(RPC_URL);

const getUmamiGlpVaultsYield = async () => {
  const vaults = [];
  await Promise.all(
    UMAMI_ALL_VAULTS.map(async (vault) => {
      const vaultContract = new web3.eth.Contract(vaultAbi, vault.address);

      const [tvl, pps, timelockBalance] = await Promise.all([
        vaultContract.methods.tvl().call(),
        vaultContract.methods.pps().call(),
        vaultContract.methods.balanceOf(vault.timelockAddress).call(),
      ]);

      const vaultFromApi = (
        await superagent.get(`${UMAMI_API_URL}/vaults/${vault.id}`)
      ).body;

      const underlyingTokenPriceKey =
        `arbitrum:${vault.underlyingAsset}`.toLowerCase();

      const underlyingTokenPrice = (
        await superagent.get(
          `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
        )
      ).body.coins[underlyingTokenPriceKey].price;
      const liquidApy = +(vaultFromApi.liquidApr * 100).toFixed(2);
      const timelockApy = +(vaultFromApi.boostedApr * 100).toFixed(2);
      vaults.push({
        pool: vault.address,
        tvlUsd: +(
          parseFloat(tvl / 10 ** vault.decimals) * underlyingTokenPrice
        ),
        apyBase: liquidApy,
        symbol: vault.symbol,
        rewardTokens: [vault.underlyingAsset],
        underlyingTokens: [vault.underlyingAsset],
        url: `https://umami.finance/vaults/${vault.id}`,
      });

      vaults.push({
        pool: vault.timelockAddress,
        tvlUsd: +(
          parseFloat(timelockBalance / 10 ** vault.decimals) *
          parseFloat(pps / 10 ** vault.decimals) *
          underlyingTokenPrice
        ),
        apyBase: timelockApy,
        symbol: vault.timelockSymbol,
        rewardTokens: [vault.underlyingAsset],
        underlyingTokens: [vault.underlyingAsset],
        url: `https://umami.finance/vaults/${vault.id}`,
      });
    })
  );

  return vaults;
};

module.exports = {
  getUmamiGlpVaultsYield,
};
