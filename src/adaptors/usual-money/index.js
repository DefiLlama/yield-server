const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CONFIG = {
	ETHEREUM: {
		USD0PP: '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0',
		USD0: '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5',
		CHAIN: 'Ethereum'
	},
	ARBITRUM: {
		USD0PP: '0x2B65F9d2e4B84a2dF6ff0525741b75d1276a9C2F',
		USD0: '0x35f1C5cB7Fb977E669fD244C567Da99d8a3a6850',
		CHAIN: 'Arbitrum'
	},
	USUAL_TOKEN: '0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E',
	SYMBOL: 'USD0++',
	URLS: {
		REWARD_RATE: 'https://app.usual.money/api/rewards/rates/',
		LLAMA_PRICE: 'https://coins.llama.fi/prices/current/'
	},
	SCALAR: 1e18
};

async function getTokenSupply(chain, address) {
	const params = {
		chain: chain.toLowerCase(),
		target: address,
		abi: 'erc20:totalSupply',
	};
	const { output } = await sdk.api.abi.call(params);
	return output / CONFIG.SCALAR;
}

async function getTokenPrice(chain, address) {
	const priceKey = `${chain.toLowerCase()}:${address}`;
	const { data } = await axios.get(`${CONFIG.URLS.LLAMA_PRICE}${priceKey}`);
	return data.coins[priceKey].price;
}

function createPoolData(chain, poolAddress, tvlUsd, apyReward, underlyingToken) {
	return {
		pool: poolAddress,
		chain,
		project: 'usual-money',
		symbol: CONFIG.SYMBOL,
		tvlUsd,
		apyReward,
		rewardTokens: [CONFIG.USUAL_TOKEN],
		underlyingTokens: [underlyingToken]
	};
}

async function getChainData(chainConfig) {
	const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.USD0PP);
	const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0PP);
	return { supply, price };
}

const apy = async () => {
	const { data: rewardData } = await axios.get(`${CONFIG.URLS.REWARD_RATE}${CONFIG.SYMBOL}`);
	const reward = rewardData.rewards.find(
		(e) => CONFIG.USUAL_TOKEN.toLowerCase() === e.rewardToken.toLowerCase()
	);
	const apyReward = utils.aprToApy(reward.apr, 52) * 100;

	const ethData = await getChainData(CONFIG.ETHEREUM);
	const arbData = await getChainData(CONFIG.ARBITRUM);

	return [
		createPoolData(
			CONFIG.ETHEREUM.CHAIN,
			CONFIG.ETHEREUM.USD0PP,
			ethData.supply * ethData.price,
			apyReward,
			CONFIG.ETHEREUM.USD0
		),
		createPoolData(
			CONFIG.ARBITRUM.CHAIN,
			CONFIG.ARBITRUM.USD0PP,
			arbData.supply * arbData.price,
			apyReward,
			CONFIG.ARBITRUM.USD0
		)
	];
};

module.exports = {
	apy,
	url: 'https://app.usual.money/swap?action=stake'
};
