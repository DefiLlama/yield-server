const axios = require('axios');

const BASE_URL = 'https://api.merkl.xyz';

const getMerklHeaders = (extra = {}) => {
  const key = process.env.MERKL_API_KEY;
  return key ? { 'X-API-Key': key, ...extra } : { ...extra };
};

const buildUrl = (pathOrUrl) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const suffix = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${BASE_URL}${suffix}`;
};

const merklGet = async (pathOrUrl, options = {}) => {
  const { headers, ...rest } = options;
  const res = await axios.get(buildUrl(pathOrUrl), {
    ...rest,
    headers: getMerklHeaders(headers),
  });
  return res.data;
};

module.exports = {
  MERKL_BASE_URL: BASE_URL,
  getMerklHeaders,
  merklGet,
};
