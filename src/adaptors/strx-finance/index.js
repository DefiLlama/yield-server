const utils = require('../utils');
const {
	request,
	gql,
	GraphQLClient
} = require('graphql-request');

const client = new GraphQLClient('https://graphql.bitquery.io', {
	headers: {
		'X-API-KEY': 'BQYXycn5sT0mgVrAyf0FjAeMwfGeVEia'
	}
});

const STAKING_ADDRESS = 'TGrdCu9fu8csFmQptVE25fDzFmPU9epamH';

async function getRevenue(_days) {
	const query = gql`
	  query {
	    tron {
	      transfers(
		currency: {is: "TRX"}
		receiver: {is: "${STAKING_ADDRESS}"}
		success: true
		external: true
		date: {since: "${new Date(new Date()-86400*_days*1000).toISOString()}", till: "${new Date().toISOString()}"}
	      ) {
		amount
		contractType(contractType: {is: Transfer})
	      }
	    }
	  }
	`;
	const data = await client.request(query);
	return (data.tron.transfers[0].amount * (10 ** 6));
}

async function getCurrentStake() {
	let postdata = {
		"contract_address": "414b8a2c619bccb710206b3d11e28dce62d8d72a8b",
		"owner_address": "4128fb7be6c95a27217e0e0bff42ca50cd9461cc9f",
		"function_selector": "reservedTRX()",
		"parameter": "",
		"call_value": 0
	};
	let result = await utils.getData('https://api.trongrid.io/wallet/triggerconstantcontract', postdata);
	let stake = parseInt(result.constant_result[0], 16);
	return stake;
}

async function calcAPY(revenue, stake, _days) {
	return (revenue * 365 / _days / stake) * 100;
}
const poolsFunction = async () => {
	const revenue1D = await getRevenue(1);
	const revenue7D = await getRevenue(7);
	const totalStake = await getCurrentStake();
	const dailyAPY = await calcAPY(revenue1D, totalStake, 1);
	const weeklyAPY = await calcAPY(revenue7D, totalStake, 7);
	const dataTvl = await utils.getData(
		'https://api.llama.fi/tvl/strx-finance'
	);
	const StakingPool = {
		pool: STAKING_ADDRESS,
		chain: utils.formatChain('tron'),
		project: 'strx-finance',
		symbol: utils.formatSymbol('TRX'),
		tvlUsd: dataTvl,
		apyBase: Number(dailyAPY),
		apyBase7d: Number(weeklyAPY)
	};
	return [StakingPool];
}
module.exports = {
	timetravel: false,
	apy: poolsFunction,
	url: "https://app.strx.finance",
};
