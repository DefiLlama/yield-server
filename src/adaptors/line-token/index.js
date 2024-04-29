const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const utils = require('../utils');

const { LINE_CONTRACT_ADDRESS, CHAIN, PROJECT, COLLATERAL_TOKEN_CONTRACT_ADDRESS } = require('./config');
const { getCurrentLinePrice, getAllPools, getTotalDebt, getInterestRate, getPoolTokenPrice, fetchPriceFromCoingecko, getSymbol } = require('./utils');

const TOKENS_DECIMALS = 18;

const COMMON_DATA = {
	chain: CHAIN,
	project: PROJECT,
	rewardTokens: [LINE_CONTRACT_ADDRESS],
};

const apy = async () => {
	const pools = await getAllPools();
	const linePriceInCollateralToken = await getCurrentLinePrice();
	const collateralTokenPriceInUSD = await fetchPriceFromCoingecko(COLLATERAL_TOKEN_CONTRACT_ADDRESS);
	const totalDebt = await getTotalDebt();
	const interestRate = await getInterestRate();

	const totalRewardPerYear = BigNumber(interestRate).multipliedBy(totalDebt).dividedBy("10000").dividedBy(10 ** TOKENS_DECIMALS);

	const results = [];

	for (const pool of pools) {
		const { reward_share10000, last_total_reward, total_pool_reward_per_token, total_staked_in_pool: totalStakedInPool, poolContractAddress } = pool;

		const poolRewardPerYear = totalRewardPerYear.multipliedBy(reward_share10000).multipliedBy("1e-4");

		const stakedTokenPriceInUSD = await getPoolTokenPrice(poolContractAddress, BigNumber(linePriceInCollateralToken).dividedBy(10 ** TOKENS_DECIMALS).toString());

		if (collateralTokenPriceInUSD === "0" || stakedTokenPriceInUSD === "0") continue;

		const poolRewardPerYearInUSD = poolRewardPerYear.multipliedBy(collateralTokenPriceInUSD).multipliedBy(linePriceInCollateralToken).dividedBy(10 ** TOKENS_DECIMALS);

		const divider = BigNumber(totalStakedInPool).multipliedBy(stakedTokenPriceInUSD).dividedBy(10 ** TOKENS_DECIMALS).toString();
		const apy = poolRewardPerYearInUSD.dividedBy(divider).toNumber();

		const tvlUsd = BigNumber(totalStakedInPool).multipliedBy(stakedTokenPriceInUSD).dividedBy(10 ** TOKENS_DECIMALS).toNumber()
		
		const symbol = await getSymbol(poolContractAddress);

		results.push({
			apy,
			tvlUsd,
			...COMMON_DATA,
			pool: `${poolContractAddress}-${CHAIN}`.toLowerCase(),
			symbol: utils.formatSymbol(symbol),
		});
	};

	return results;
};


module.exports = {
	timetravel: false,
	url: 'https://linetoken.org/staking/all',
	apy
};