const axios = require('axios')

const algoAPI = axios.create({
  baseURL: 'https://mainnet-idx.algonode.cloud',
  timeout: 300000,
})

async function getGlobalState(appId) {
  const response = await algoAPI.get(`/v2/applications/${appId}`)
  const globalState = response.data.application.params['global-state']
  return globalState
}

async function getBoxData(appId, boxId) {
  const response = await algoAPI.get(`/v2/applications/${appId}/box?name=${boxId}`)
  const data = Buffer.from(response.data.value, 'base64')
  return data
}

module.exports = {
  getGlobalState,
  getBoxData,
}