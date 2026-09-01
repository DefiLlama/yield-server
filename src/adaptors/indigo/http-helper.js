const axios = require("axios")

async function get(endpoint, options) {
  try {
    return (await axios.get(endpoint, options)).data
  } catch (e) {
    throw new Error(`Failed to get ${endpoint}`)
  }
}

async function post(endpoint, body, options) {
  try {
    return (await axios.post(endpoint, body, options)).data
  } catch (e) {
    throw new Error(`Failed to post ${endpoint}`)
  }
}

module.exports = {
  get,
  post
}