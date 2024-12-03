const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const usd0PP = '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0';
const usd0   = '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5';
const usual  = '0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E';

const symbol = 'USD0++';

const baseURLRewardRate = 'https://app.usual.money/api/rewards/rates/';
const baseURLLlamaPrice = 'https://coins.llama.fi/prices/current/';
const scalarOne = 1e18;

const apy = async () => {
	const totalSupply = 
		( await sdk.api.abi.call({
			target: usd0PP,
			abi: 'erc20:totalSupply',
		})
		).output / scalarOne;
	const priceKey = `ethereum:${usd0PP}`;
	const price = (await axios.get(`${baseURLLlamaPrice}${priceKey}` )).data.coins[priceKey].price;
	const tvlUsd = totalSupply * price;
	const reward = (await axios.get(`${baseURLRewardRate}${symbol}`)).data.rewards.find((e) => usual.toLowerCase() == e.rewardToken.toLowerCase());
	const apyReward = utils.aprToApy(reward.apr, 52) * 100;
	return [{
		pool: usd0PP,
		chain: 'Ethereum',
		project: 'usual-money',
		symbol: 'USD0++',
		tvlUsd,
		apyReward, 
		rewardTokens: [usual],
		underlyingTokens: [usd0],
		},
	];
}

module.exports = {
	apy,
	url: 'https://app.usual.money/swap?action=stake',
};
