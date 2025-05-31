const customHeader = (cacheTime) => {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': `max-age=${cacheTime}`,
  };
};

const getCacheDates = () => {
  const date = new Date();
  const minutes = date.getMinutes();
  
  date.setMinutes(minutes + 5);

  return {
    nextCacheDate: date,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      Expires: date.toUTCString(),
      'Cache-Control': 'max-age=300',
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
