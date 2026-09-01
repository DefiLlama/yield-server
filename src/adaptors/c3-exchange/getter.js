const { globalStateToBlob, parsePricecasterData, parseInstrumentData } = require('./codec')
const { getGlobalState, getBoxData } = require('./axios')

const CORE_APP_ID = 1257259627

const TAG_INSTRUMENT_COUNT = Buffer.from('c').toString('base64')
const TAG_INIT_TIMESTAMP = Buffer.from('t').toString('base64')
const TAG_PRICECASTER_ID = Buffer.from('p').toString('base64')
const INSTRUMENT_BOX_ID = 'str:i'

async function getPriceMap(coreState) {
  const pricecasterState = await getGlobalState(coreState.pricecasterId)
  const priceData = globalStateToBlob(pricecasterState)
  const result = parsePricecasterData(coreState.instrumentCount, priceData)
  return result
}

async function getCoreData() {
  const coreState = await getGlobalState(CORE_APP_ID)
  const instrumentCount = coreState.find((x) => x.key == TAG_INSTRUMENT_COUNT).value.uint
  const initTimestamp = coreState.find((x) => x.key == TAG_INIT_TIMESTAMP).value.uint
  const pricecasterId = coreState.find((x) => x.key == TAG_PRICECASTER_ID).value.uint

  const boxData = await getBoxData(CORE_APP_ID, INSTRUMENT_BOX_ID)
  const instruments = parseInstrumentData(instrumentCount, boxData)

  return {
    instrumentCount,
    initTimestamp,
    pricecasterId,
    instruments,
  }
}

module.exports = {
  getPriceMap,
  getGlobalData: getCoreData,
}
