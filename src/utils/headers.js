const customHeader = (cacheTime) => {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `max-age=${cacheTime}`,
  };
};

const getCacheDates = () => {
  const date = new Date();
  date.setMinutes(22);
  if (date < new Date()) {
    // we are past the :22 mark, roll over to next hour
    date.setHours(date.getHours() + 1);
  }
  return {
    nextCacheDate: date,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      Expires: date.toUTCString(),
    }
  };
};

const customHeaderFixedCache = () => {
  return getCacheDates().headers
};

module.exports = {
  customHeader,
  customHeaderFixedCache,
  getCacheDates
};
