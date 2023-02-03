const utils = require('../utils');

const API_HOST = 'https://nodes.wavesnodes.com'; // https://docs.waves.tech/en/waves-node/node-api/#api-of-pool-of-public-nodes

/**
 * Read account data entries by a given key
 * @param {string} address - Address base58 encoded
 * @param {string} key - Data key
 * @returns {{
 *   key: string,
 *   type: string,
 *   value: any
 * }} Data value
 */
async function data(address, key) {
  return await utils.getData(`${API_HOST}/addresses/data/${address}/${key}`);
}

module.exports = {
  data,
};
