const sdk = require('@defillama/sdk');
const BigNumber = require("bignumber.js");
const { requery } = require('./requery');

const lpReservesAbi = { "constant": true, "inputs": [], "name": "getReserves", "outputs": [{ "internalType": "uint112", "name": "_reserve0", "type": "uint112" }, { "internalType": "uint112", "name": "_reserve1", "type": "uint112" }, { "internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32" }], "payable": false, "stateMutability": "view", "type": "function" }
const lpSuppliesAbi = { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }
const token0Abi = { "constant": true, "inputs": [], "name": "token0", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }
const token1Abi = { "constant": true, "inputs": [], "name": "token1", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }

/* lpPositions:{
    balance,
    token
}[]
*/
async function unwrapUniswapLPs(balances, lpPositions, block, chain = 'ethereum', transformAddress = (addr) => addr, excludeTokensRaw = [], retry = false, uni_type = 'standard',) {
  const excludeTokens = excludeTokensRaw.map(addr => addr.toLowerCase())
  const lpTokenCalls = lpPositions.map(lpPosition => ({
    target: lpPosition.token
  }))
  const lpReserves = sdk.api.abi.multiCall({
    block,
    abi: lpReservesAbi,
    calls: lpTokenCalls,
    chain
  })
  const lpSupplies = sdk.api.abi.multiCall({
    block,
    abi: lpSuppliesAbi,
    calls: lpTokenCalls,
    chain
  })
  const tokens0 = sdk.api.abi.multiCall({
    block,
    abi: token0Abi,
    calls: lpTokenCalls,
    chain
  })
  const tokens1 = sdk.api.abi.multiCall({
    block,
    abi: token1Abi,
    calls: lpTokenCalls,
    chain
  })
  if (retry) {
    await Promise.all([
      [lpReserves, lpReservesAbi],
      [lpSupplies, lpSuppliesAbi],
      [tokens0, token0Abi],
      [tokens1, token1Abi]
    ].map(async call => {
      await requery(await call[0], chain, block, call[1])
    }))
  }
  await Promise.all(lpPositions.map(async lpPosition => {
    try {
      let token0, token1, supply
      const lpToken = lpPosition.token
      const token0_ = (await tokens0).output.find(call => call.input.target === lpToken)
      const token1_ = (await tokens1).output.find(call => call.input.target === lpToken)
      const supply_ = (await lpSupplies).output.find(call => call.input.target === lpToken)

      token0 = token0_.output.toLowerCase()
      token1 = token1_.output.toLowerCase()
      supply = supply_.output
      // console.log(token0_, supply_, token1_, lpToken)

      if (supply === "0") {
        return
      }

      let _reserve0, _reserve1
      if (uni_type === 'standard') {
        ({ _reserve0, _reserve1 } = (await lpReserves).output.find(call => call.input.target === lpToken).output)
      }
      else if (uni_type === 'gelato') {
        const gelatoPools = sdk.api.abi.multiCall({
          block,
          abi: gelatoPoolsAbi,
          calls: lpTokenCalls,
          chain
        });
        const gelatoPool = (await gelatoPools).output.find(call => call.input.target === lpToken).output
        const [{ output: _reserve0_ }, { output: _reserve1_ }] = (await Promise.all([
          sdk.api.erc20.balanceOf({
            target: token0,
            owner: gelatoPool,
            block,
            chain
          })
          , sdk.api.erc20.balanceOf({
            target: token1,
            owner: gelatoPool,
            block,
            chain
          })
        ]))
        _reserve0 = _reserve0_
        _reserve1 = _reserve1_
      }

      if (!excludeTokens.includes(token0)) {
        const token0Balance = BigNumber(lpPosition.balance).times(BigNumber(_reserve0)).div(BigNumber(supply))
        sdk.util.sumSingleBalance(balances, await transformAddress(token0), token0Balance.toFixed(0))
      }
      if (!excludeTokens.includes(token1)) {
        const token1Balance = BigNumber(lpPosition.balance).times(BigNumber(_reserve1)).div(BigNumber(supply))
        sdk.util.sumSingleBalance(balances, await transformAddress(token1), token1Balance.toFixed(0))
      }
    } catch (e) {
      console.log(`Failed to get data for LP token at ${lpPosition.token} on chain ${chain}`)
      throw e
    }
  }))
}
const crv_abi = {
  "crvLP_coins": { "stateMutability": "view", "type": "function", "name": "coins", "inputs": [{ "name": "arg0", "type": "uint256" }], "outputs": [{ "name": "", "type": "address" }], "gas": 3123 }
}
async function genericUnwrapCrv(balances, crvToken, lpBalance, block, chain) {
	const { output: resolvedCrvTotalSupply } = await sdk.api.erc20.totalSupply({
		target: crvToken,
		chain, block
	})

	// Get Curve LP token balances
	// A while-loop would need a try-catch because sending error when idx > tokens_count
	const { output: crv_symbol } = await sdk.api.abi.call({
		abi: 'erc20:symbol',
		target: crvToken,
		chain,
		block
	})

	const LP_tokens_count = ['3Crv'].includes(crv_symbol) ? 3 : 2
	const coins_indices = Array.from(Array(LP_tokens_count).keys())
	const coins = (await sdk.api.abi.multiCall({
		abi: crv_abi['crvLP_coins'],
		calls: coins_indices.map(i => ({ params: [i] })),
		target: crvToken,
		chain,
		block
	})).output.map(c => c.output)
	const crvLP_token_balances = await sdk.api.abi.multiCall({
		abi: 'erc20:balanceOf',
		calls: coins.map(c => ({
			target: c,
			params: crvToken,
		})),
		chain,
		block
	})

	// Edit the balances to weigh with respect to the wallet holdings of the crv LP token
	crvLP_token_balances.output.forEach(call =>
		call.output = BigNumber(call.output).times(lpBalance).div(resolvedCrvTotalSupply).toFixed(0)
	)
	sdk.util.sumMultiBalanceOf(balances, crvLP_token_balances);
}

async function sumTokensAndLPs(balances, tokens, block, chain = "ethereum", transformAddress = id => id) {
  const balanceOfTokens = await sdk.api.abi.multiCall({
    calls: tokens.map(t => ({
      target: t[0],
      params: t[1]
    })),
    abi: 'erc20:balanceOf',
    block,
    chain
  })
  const lpBalances = []
  balanceOfTokens.output.forEach((result, idx) => {
    const token = result.input.target
    const balance = result.output
    if (tokens[idx][2]) {
      lpBalances.push({
        token,
        balance
      })
    } else {
      sdk.util.sumSingleBalance(balances, transformAddress(token), balance);
    }
  })
  await unwrapUniswapLPs(balances, lpBalances, block, chain, transformAddress)
}

module.exports = {
  unwrapUniswapLPs,
  genericUnwrapCrv,
  sumTokensAndLPs
}