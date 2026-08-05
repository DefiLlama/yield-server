const axios = require('axios');

const BASE_URL = 'https://api.merkl.xyz';
const DEFAULT_TIMEOUT = 30000;

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
  const { headers, timeout, ...rest } = options;
  const res = await axios.get(buildUrl(pathOrUrl), {
    timeout: timeout ?? DEFAULT_TIMEOUT,
    ...rest,
    headers: getMerklHeaders(headers),
  });
  return res.data;
};

// Aave "net APR" campaigns top the market rate up to a target APR instead of
// paying on top of it, and Merkl reports the *target* in `apr` rather than the
// incremental part it actually distributes. Subtract the market rate Merkl
// already counted (`nativeApr`) so it isn't double counted against apyBase.
const TARGET_APR_DISTRIBUTION_TYPES = new Set([
  'AAVE_NET_APR',
  'AAVE_V4_NET_APR',
]);

const getRewardApr = (opportunity) => {
  const breakdowns = opportunity.aprRecord?.breakdowns?.filter(
    (x) => x.type === 'CAMPAIGN'
  );
  if (!breakdowns?.length) return opportunity.apr;

  return breakdowns.reduce(
    (acc, x) =>
      acc +
      (TARGET_APR_DISTRIBUTION_TYPES.has(x.distributionType)
        ? Math.max(0, x.value - (opportunity.nativeApr || 0))
        : x.value),
    0
  );
};

module.exports = {
  MERKL_BASE_URL: BASE_URL,
  getMerklHeaders,
  merklGet,
  getRewardApr,
};
