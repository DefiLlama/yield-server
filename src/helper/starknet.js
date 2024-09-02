// https://www.starknetjs.com/docs/API/contract
const { Contract, validateAndParseAddress, number, hash, uint256, } = require('starknet')
const axios = require('axios')
const plimit = require('p-limit')
const { sliceIntoChunks, sleep } = require('./utils')

const _rateLimited = plimit(1)
const rateLimited = fn => (...args) => _rateLimited(() => fn(...args))

const STARKNET_RPC = 'https://starknet-mainnet.public.blastapi.io'

function formCallBody({ abi, target, params = [], allAbi = [] }, id = 0) {
  if ((params || params === 0) && !Array.isArray(params))
    params = [params]
  const contract = new Contract([abi, ...allAbi,], target, null)
  const requestData = contract.populate(abi.name, params)
  requestData.entry_point_selector = hash.getSelectorFromName(requestData.entrypoint)
  requestData.contract_address = requestData.contractAddress
  requestData.calldata = params
  delete requestData.contractAddress
  delete requestData.entrypoint
  if (abi.customInput === 'address')  requestData.calldata = params.map(i => i.slice(2))
  return getCallBody(requestData, id)

  function getCallBody(i) {
    return { jsonrpc: "2.0", id, method: "starknet_call", params: [i, "latest"] }
  }
}

function parseOutput(result, abi, allAbi) {
  const contract = new Contract([abi,...allAbi], null, null)
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
}

async function call({ abi, target, params = [], allAbi = [] } = {}, ...rest) {
  const { data: { result } } = await axios.post(STARKNET_RPC, formCallBody({ abi, target, params, allAbi }))
  return parseOutput(result, abi, allAbi)
}

async function multiCall({ abi: rootAbi, target: rootTarget, calls = [], allAbi = [] }) {
  if (!calls.length) return []
  calls = calls.map((callArgs) => {
    if (typeof callArgs !== 'object') {
      if (!rootTarget) return { target: callArgs, abi: rootAbi, allAbi, }
      return { target: rootTarget, params: callArgs, abi: rootAbi, allAbi, }
    }
    const { target, params, abi } = callArgs
    return { target: target || rootTarget, params, abi: abi || rootAbi }
  })
  const callBodies = calls.map(formCallBody)
  const allData = []
  const chunks = sliceIntoChunks(callBodies, 25)
  for (const chunk of chunks) {
    await sleep(2000)
    const { data } = await axios.post(STARKNET_RPC, chunk)
    allData.push(...data)
  }

  const response = []
  allData.forEach((i) => {
    const { result, id } = i
    const abi = calls[id].abi ?? rootAbi
    response[id] = parseOutput(result, abi, allAbi)
  })
  return response
}

const balanceOfABI = {
  "name": "balanceOf",
  "type": "function",
  "inputs": [
    {
      "name": "account",
      "type": "felt"
    }
  ],
  "outputs": [
    {
      "name": "balance",
      "type": "Uint256"
    }
  ],
  "stateMutability": "view",
  "customInput": 'address',
}

const api = {
  chain: 'starknet',
}

const defaultAbis = {
  balanceOf: balanceOfABI,
}

module.exports = {
  call: rateLimited(call),
  multiCall: rateLimited(multiCall),
  parseAddress: validateAndParseAddress,
  number,
}

api.call = module.exports.call
api.multiCall = module.exports.multiCall
