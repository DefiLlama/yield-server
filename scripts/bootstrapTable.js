const ss = require('simple-statistics');

const boostrapDB = (data, source) => {
  const dataDB = [];

  for (const [i, pool] of [...new Set(data.map((el) => el.pool))].entries()) {
    console.log(i);

    let X = data.filter((el) => el.pool === pool);
    if (source === 'std') {
      X = data.filter((el) => el.apy && el >= 0 && el <= 1e6);
    } else if (source === 'aggs') {
      X = data.filter((el) => el.return).map((el) => el.return);
      returnProduct =
        X.length > 0 ? X.map((a) => 1 + a).reduce((a, b) => a * b) : null;
    }
    if (X.length === 0) continue;

    const count = X.length;
    const mean = X.reduce((a, b) => a + b, 0) / count;
    const mean2 = count < 2 ? null : ss.variance(X) * (count - 1);

    const o = {
      pool,
      count,
      mean,
      mean2,
    };
    if (source === 'aggs') {
      o['returnProduct'] = returnProduct;
    }
    dataDB.push(d);
  }

  return dataDB;
};

module.exports = {
  boostrapDB,
};
