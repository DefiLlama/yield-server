const { formatSymbol, formatChain } = require('../utils')

function decodeUint(value, index = 0, length = 8) {
  let num = BigInt(0)
  for (let i = 0; i < length; i++) {
    num = (num << 8n) | BigInt(value[index++])
  }
  return num
}

function getSymbol(assetId) {
  const symbolMap = {
    0: 'ALGO',
    893309613: 'AVAX',
    1058926737: 'BTC',
    891648844: 'BNB',
    1221549217: 'ARB',
    1007352535: 'USDC',
    887406851: 'ETH',
    887648583: 'SOL',
    1684682524: 'PYTH',
    1703994770: 'W',
  }

  return symbolMap[assetId] ? formatSymbol(symbolMap[assetId]) : undefined
}

function getUrl(assetId) {
  const urlMap = {
    0: 'ALGO-USDC',
    893309613: 'AVAX-USDC',
    1058926737: 'BTC-USDC',
    1221549217: 'ARB-USDC',
    887406851: 'ETH-USDC',
    887648583: 'SOL-USDC',
    1684682524: 'PYTH-USDC',
    1703994770: 'W-USDC',
  }

  const pairId = urlMap[assetId]
  return pairId ? `https://c3.io/trade/${pairId}` : undefined
}

function getChain(assetId) {
  const chainMap = {
    0: 'algorand',          //ALGO
    893309613: 'avax',      //AVAX
    1058926737: 'bitcoin',  //BTC
    891648844: 'bsc',       //BNB
    1221549217: 'arbitrum', //ARB
    1007352535: 'avax',     //USDC
    887406851: 'ethereum',  //ETH
    887648583: 'solana',    //SOL
    1684682524: 'solana',   //PYTH
    1703994770: 'solana',   //W
  }

  return chainMap[assetId] ? formatChain(chainMap[assetId]) : undefined
}

function getTokenAddress(assetId) {
  const tokenAddressesMap = {
    0: ['0'],                                                     //ALGO - Algorand
    893309613: ['0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7'],    //AVAX - Avax
    1058926737: ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],   //BTC - Ethereum
    891648844: ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'],    //BNB - bsc
    1221549217: ['0x912CE59144191C1204E64559FE8253a0e49E6548'],   //ARB - Arbitrum
    1007352535: ['0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'],   //USDC - Avax
    887406851: ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],    //ETH - Ethereum
    887648583: ['So11111111111111111111111111111111111111112'],   //SOL - Solana
    1684682524: ['HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3'], //PYTH - Solana
    1703994770: ['85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ'], //W - Solana
  }

  return tokenAddressesMap[assetId]
}

function globalStateToBlob(globalState) {
  // Collect the parts of the data block
  const parts = []
  for (let i = 0; i < globalState.length; i++) {
    const entry = globalState[i]
    
    const indexBuffer = Buffer.from(entry.key, 'base64')
    if (indexBuffer.length !== 1) continue

    const index = indexBuffer[0]
    if (index >= 64) continue

    const data = Buffer.from(entry.value.bytes, 'base64')
    
    parts[index] = data
  }

  // Concatenate parts
  const collectedData = Buffer.concat(parts)

  return collectedData
}

function parsePricecasterData(count, data) {
  // Parse out asset ID an normalized price for instruments from contract data
  const priceMap = {}
  let ptr = 0

  const readUint = (length = 8) => {
    const result = decodeUint(data, ptr, length)
    ptr += length
    return result
  }

  for (let i = 0; i < count; i++) {
    // Load relevant fields from data
    const assetId = readUint()
    const normalizedPrice = readUint()
    ptr += 2*8 + 4 + 7*8 // Skip unused fields

    // Append data to map
    priceMap[assetId] = normalizedPrice
  }

  return priceMap
}

function parseInstrumentData(count, data) {
  // Parse out relevant info for instruments from contract data
  const result = []
  let ptr = 0

  const readUint = (length = 8) => {
    const result = decodeUint(data, ptr, length)
    ptr += length
    return result
  }

  for (let i = 0; i < count; i++) {
    // Decode relevant fields from instrument data
    const assetId = readUint()
    ptr += 4*2 // Skip liquidation related fields
    const lastUpdateTime = readUint(4)
    const borrowIndex = readUint()
    const lendIndex = readUint()
    const optimalUtilization = readUint(2)
    const minRate = readUint()
    const optRate = readUint()
    const maxRate = readUint()
    const borrowed = readUint()
    const liquidity = readUint()

    result.push({
      assetId,
      lastUpdateTime,
      borrowIndex,
      lendIndex,
      borrowed,
      liquidity,
      poolRates: {
        optimalUtilization,
        minRate,
        optRate,
        maxRate,
      }
    })
  }

  return result
}

module.exports = {
  getSymbol,
  getUrl,
  getChain,
  getTokenAddress,
  globalStateToBlob,
  parsePricecasterData,
  parseInstrumentData,
}
