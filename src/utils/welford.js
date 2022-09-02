module.exports.welfordUpdate = (pools, stats) => {
  // calc std using welford's algorithm
  // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
  // For a new value newValue, compute the new count, new mean, the new M2.
  // mean accumulates the mean of the entire dataset
  // M2 aggregates the squared distance from the mean
  // count aggregates the number of samples seen so far

  const payload = [];
  for (const p of pools) {
    d = stats[p.configID];

    if (d !== undefined) {
      // extract
      count = d.count;
      meanAPY = d.meanAPY;
      mean2APY = d.mean2APY;
      meanDR = d.meanDR;
      mean2DR = d.mean2DR;
      productDR = d.productDR;

      // update using welford algo
      count += 1;
      // a) ML section
      deltaAPY = p.apy - meanAPY;
      meanAPY += deltaAPY / count;
      delta2APY = p.apy - meanAPY;
      mean2APY += deltaAPY * delta2APY;
      // b) scatterchart section
      deltaDR = p.return - meanDR;
      meanDR += deltaDR / count;
      delta2DR = p.return - meanDR;
      mean2DR += deltaDR * delta2DR;
      productDR = (1 + p.return) * productDR;
    } else {
      // in case of a new pool -> boostrap db values
      count = 1;
      // a) ML section
      meanAPY = p.apy;
      mean2APY = 0;
      // b) scatterchart section
      meanDR = p.return;
      mean2DR = 0;
      productDR = 1 + p.return;
    }

    payload.push({
      configID: p.configID,
      count,
      meanAPY,
      mean2APY,
      meanDR,
      mean2DR,
      productDR,
    });
  }
  return payload;
};
