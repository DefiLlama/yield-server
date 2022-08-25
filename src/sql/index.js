const { QueryFile } = require('pg-promise');
const { join: joinPath } = require('path');

// copy pasta from:
// https://github.com/vitaly-t/pg-promise-demo/blob/master/JavaScript/db/sql/index.js
module.exports = {
  yield: {
    getYield: sql('yield/getYield.sql'),
    getYieldHistory: sql('yield/getYieldHistory.sql'),
    getYieldOffset: sql('yield/getYieldOffset.sql'),
    getYieldProject: sql('yield/getYieldProject.sql'),
  },
  stat: {
    getStat: sql('stat/getStat.sql'),
  },
  url: {
    getUrl: sql('url/getUrl.sql'),
  },
  meta: {
    getMeta: sql('url/getMeta.sql'),
  },
  median: {
    getMedian: sql('url/getMedian.sql'),
  },
};

///////////////////////////////////////////////
// Helper for linking to external query files;
function sql(file) {
  const fullPath = joinPath(__dirname, file); // generating full path;

  const options = {
    // minifying the SQL is always advised;
    // see also option 'compress' in the API;
    minify: true,

    // See also property 'params' for two-step template formatting
  };

  const qf = new QueryFile(fullPath, options);

  if (qf.error) {
    // Something is wrong with our query file :(
    // Testing all files through queries can be cumbersome,
    // so we also report it here, while loading the module:
    console.error(qf.error);
  }

  return qf;

  // See QueryFile API:
  // http://vitaly-t.github.io/pg-promise/QueryFile.html
}
