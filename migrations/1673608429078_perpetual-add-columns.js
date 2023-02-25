exports.up = (pgm) => {
  pgm.addColumns('perpetual', {
    fundingRatePrevious: 'numeric',
    fundingTimePrevious: 'numeric',
  });
};
