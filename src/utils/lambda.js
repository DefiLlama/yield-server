function lambdaResponse(body, { statusCode = 200, headers } = {}) {
  const date = new Date();
  date.setMinutes(22);
  if (date < new Date()) {
    // we are past the :22 mark, roll over to next hour
    date.setHours(date.getHours() + 1);
  }
  const response = {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Expires: date.toUTCString(),
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  };
  return response;
}

function lambdaResponseFixedCache(body, { statusCode = 200, cacheTime } = {}) {
  // cacheTime in seconds
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `max-age=${cacheTime}`,
    },
  };
}

const customHeader = (cacheTime) => {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `max-age=${cacheTime}`,
  };
};

module.exports = {
  lambdaResponse,
  lambdaResponseFixedCache,
  customHeader,
};
