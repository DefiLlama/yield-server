const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const { Web3 } = require('web3');
const wiseLendingABI = require('./abi/wiseLendingABI.json');
const wiseSecurityABI = require('./abi/wiseSecurityABI.json');
const erc20ABI = require('./abi/erc20ABI.json');
const { getProvider } = require('@defillama/sdk/build/general');
const superagent = require('superagent');

const WISE_LENDING_CONTRACT = '0x37e49bf3749513A02FA535F0CbC383796E8107E4';
const WISE_SECURITY_CONTRACT = '0x829c3AE2e82760eCEaD0F384918a650F8a31Ba18';
const FEE_MANAGER_CONTRACT = '0x0bC24E61DAAd6293A1b3b53a7D01086BfF0Ea6e5';

const address = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

const ChainName = {
  ethereum: 'Ethereum',
};

const projectSlug = 'wise-lending';
const tokens = ['WETH'];

const web3 = new Web3(
  'https://mainnet.infura.io/v3/b2ca877d39fa4a1c99e9120a03d53e57'
);

async function apy() {
  const pools = await Promise.all(
    ['ethereum'].map(async (chain) => {
      return (
        await Promise.all(
          // Lend Pool
          [
            Promise.all(
              tokens.map(async (token) => {
                const tokenAddress = `${chain}:${address[token]}`;

                const usdPrice = (
                  await superagent.get(
                    `https://coins.llama.fi/prices/current/${tokenAddress}`
                  )
                ).body.coins[tokenAddress];

                const wiseSecurityContract = await new web3.eth.Contract(
                  wiseSecurityABI,
                  WISE_SECURITY_CONTRACT
                );

                const lendingRate =
                  (await wiseSecurityContract.methods
                    .getLendingRate(address[token])
                    .call()) / 1e16;
                const borrowRate =
                  (await wiseSecurityContract.methods
                    .getBorrowRate(address[token])
                    .call()) / 1e16;

                const wiseLendingContract = await new web3.eth.Contract(
                  wiseLendingABI,
                  WISE_LENDING_CONTRACT
                );

                const totalBorrow =
                  (await wiseLendingContract.methods
                    .getPseudoTotalBorrowAmount(address[token])
                    .call()) / 1e18;
                const totalSupply =
                  (await wiseLendingContract.methods
                    .getPseudoTotalPool(address[token])
                    .call()) / 1e18;

                const tokenContract = await new web3.eth.Contract(
                  erc20ABI,
                  address[token]
                );

                const balance =
                  (await tokenContract.methods
                    .balanceOf(WISE_LENDING_CONTRACT)
                    .call()) / 1e18;

                const tvlUsd = balance * usdPrice.price;
                const totalSupplyUsd = totalSupply * usdPrice.price;
                const totalBorrowUsd = totalBorrow * usdPrice.price;

                return {
                  pool: `${address[token]}-wise-lending-${chain}`,
                  chain: ChainName[chain],
                  project: projectSlug,
                  symbol: usdPrice.symbol,
                  tvlUsd,
                  apyBase: lendingRate,
                  // apyReward: lendingRate,
                  url: 'https://wiselending.com/',
                  apyBaseBorrow: borrowRate,
                  // apyRewardBorrow: borrowRate,
                  totalSupplyUsd,
                  totalBorrowUsd,
                };
              })
            ),
          ]
        )
      ).flat();
    })
  );

  return pools.flat();
}

module.exports = {
  timetravel: false,
  apy: apy,
};
