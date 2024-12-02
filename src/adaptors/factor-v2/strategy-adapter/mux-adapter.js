const sdk = require('@defillama/sdk');
const utils = require('../../utils');
const { makeReadable } = require('./utils');

/*//////////////////////////////////////////////////////////////////////////////
                               Mux Reward Router                                                 
//////////////////////////////////////////////////////////////////////////////*/

async function getDataFromRewardRouter() {
  const REWARD_ROUTER_ADDRESS = '0xaf9C4F6A0ceB02d4217Ff73f3C95BbC8c7320ceE';

  const rewardRouterABIs = [
    'uint256:feeRewardRate',
    'uint256:muxRewardRate',
    'uint256:poolOwnedRate',
    'uint256:votingEscrowedRate',
  ];

  const [feeRewardRate, muxRewardRate, poolOwnedRate, votingEscrowedRate] =
    await Promise.all(
      rewardRouterABIs.map(async (abi) => {
        const { output } = await sdk.api.abi.call({
          target: REWARD_ROUTER_ADDRESS,
          abi: abi,
          chain: 'arbitrum',
        });
        return output;
      })
    );
  return {
    feeRewardRate: makeReadable(feeRewardRate),
    muxRewardRate: makeReadable(muxRewardRate),
    poolOwnedRate: makeReadable(poolOwnedRate),
    votingEscrowedRate: makeReadable(votingEscrowedRate),
  };
}

/*//////////////////////////////////////////////////////////////////////////////
                            Mux Pool Owned Liquidity                                                    
//////////////////////////////////////////////////////////////////////////////*/

async function getDataFromPOL() {
  const MLP_ADDRESS = '0x7CbaF5a14D953fF896E5B3312031515c858737C8';
  const POL_ADDRESS = '0x18891480b9dd2aC5eF03220C45713d780b5CFdeF';

  const { output: mlpPolBalance } = await sdk.api.abi.call({
    target: MLP_ADDRESS,
    abi: 'erc20:balanceOf',
    params: [POL_ADDRESS],
    chain: 'arbitrum',
  });

  return {
    mlpPolBalance: makeReadable(mlpPolBalance),
  };
}

/*//////////////////////////////////////////////////////////////////////////////
                                  Token Prices                                              
//////////////////////////////////////////////////////////////////////////////*/

async function getTokenPrices() {
  const tokenAddresses = [
    '0x7CbaF5a14D953fF896E5B3312031515c858737C8', // MuxLP
    '0x4e352cf164e64adcbad318c3a1e222e9eba4ce42', // MCB
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
  ];

  const tokenPrices = await utils.getPrices(tokenAddresses, 'arbitrum');

  const mlpPrice = tokenPrices.pricesByAddress[tokenAddresses[0].toLowerCase()];
  const mcbPrice = tokenPrices.pricesByAddress[tokenAddresses[1].toLowerCase()];
  const ethPrice = tokenPrices.pricesByAddress[tokenAddresses[2].toLowerCase()];

  return { mlpPrice, mcbPrice, ethPrice };
}

/*//////////////////////////////////////////////////////////////////////////////
                                   Mux LP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getMuxLpApr() {
  const [
    { mlpPolBalance },
    { feeRewardRate, muxRewardRate, poolOwnedRate, votingEscrowedRate },
    { mlpPrice, mcbPrice, ethPrice },
  ] = await Promise.all([
    getDataFromPOL(),
    getDataFromRewardRouter(),
    getTokenPrices(),
  ]);

  const mlpCirculatingSupply = mlpPolBalance / poolOwnedRate;

  const muxAPR =
    (muxRewardRate * mcbPrice * 86400 * 365 * (1 - votingEscrowedRate)) /
    (mlpCirculatingSupply * mlpPrice);

  const ethAPR =
    (feeRewardRate * ethPrice * 86400 * 365 * 0.7) /
    (mlpCirculatingSupply * mlpPrice);

  const totalAPR = (muxAPR + ethAPR) * 100;

  return totalAPR;
}

module.exports = { getMuxLpApr };
