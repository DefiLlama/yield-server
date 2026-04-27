const { Contract, validateAndParseAddress, number, hash, uint256, } = require('starknet')
const axios = require('axios')

function formCallBody({ abi, target, params = [] }, id = 0) {
  if ((params || params === 0) && !Array.isArray(params))
    params = [params]
  
  if (abi.name === 'asset_config_unsafe' && params.length >= 1) {
    const poolId = params[0]
    if (typeof poolId === 'string' && poolId.length > 60 && !poolId.startsWith('0x')) {
      params[0] = '0x' + BigInt(poolId).toString(16)
    }
  }
  
  if (abi.name === 'interest_rate' && params.length === 5) {
    const poolId = params[0]
    if (typeof poolId === 'string' && poolId.length > 60 && !poolId.startsWith('0x')) {
      params[0] = '0x' + BigInt(poolId).toString(16)
    }
    
    const utilizationU256 = BigInt(params[2])
    const utilizationLow = utilizationU256 & ((1n << 128n) - 1n)
    const utilizationHigh = utilizationU256 >> 128n
    
    const rateU256 = BigInt(params[4])
    const rateLow = rateU256 & ((1n << 128n) - 1n)
    const rateHigh = rateU256 >> 128n
    
    params = [
      params[0],
      params[1],
      '0x' + utilizationLow.toString(16),
      '0x' + utilizationHigh.toString(16),
      '0x' + BigInt(params[3]).toString(16),
      '0x' + rateLow.toString(16),
      '0x' + rateHigh.toString(16)
    ]
  }
  
  const entryPointSelector = hash.getSelectorFromName(abi.name)
  
  const requestData = {
    contract_address: target,
    entry_point_selector: entryPointSelector,
    calldata: params
  }
  
  return { jsonrpc: "2.0", id, method: "starknet_call", params: [requestData, "latest"] }
}

function parseAssetConfigRaw(result) {
  if (!result || result.length < 22) {
    return null
  }
  
  const parseU256 = (low, high) => {
    return BigInt(low) + (BigInt(high) << 128n)
  }
  
  const assetConfig = {
    total_collateral_shares: parseU256(result[0], result[1]),
    total_nominal_debt: parseU256(result[2], result[3]),
    reserve: parseU256(result[4], result[5]),
    max_utilization: parseU256(result[6], result[7]),
    floor: parseU256(result[8], result[9]),
    scale: parseU256(result[10], result[11]),
    is_legacy: result[12] === '1',
    last_updated: BigInt(result[13]),
    last_rate_accumulator: parseU256(result[14], result[15]),
    last_full_utilization_rate: parseU256(result[16], result[17]),
    fee_rate: parseU256(result[18], result[19])
  }
  
  const additionalValue = parseU256(result[20], result[21])
  
  return [assetConfig, additionalValue]
}

function parseOutput(result, abi) {
  if (abi.name === 'asset_config_unsafe') {
    return parseAssetConfigRaw(result)
  }
  
  if (abi.name === 'interest_rate') {
    if (result && result.length >= 2) {
      const low = BigInt(result[0])
      const high = BigInt(result[1])
      const fullValue = low + (high << 128n)
      return [fullValue.toString()]
    } else if (result && result.length === 1) {
      return [result[0]]
    }
    return result
  }
  
  try {
    const contract = new Contract([abi], null, null)
    let response = contract.parseResponse(abi.name, result)
    
    if (abi.outputs.length === 1) {
      response = response[0]
      if (abi.outputs[0].type === 'Uint256') return response
      switch (abi.customType) {
        case 'address': return validateAndParseAddress(response)
        case 'Uint256': return response
      }
    }
    return response
  } catch (error) {
    return result
  }
}

async function call({ abi, target, params = [] } = {}) {
  const callBody = formCallBody({ abi, target, params })
  
  const { data } = await axios.post(process.env.STARKNET_RPC, callBody)
  
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`)
  }
  
  const result = data.result
  return parseOutput(result, abi)
}

module.exports = {
  call,
}