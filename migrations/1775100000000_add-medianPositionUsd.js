exports.up = (pgm) => {
  pgm.addColumns('holder_daily', {
    medianPositionUsd: 'numeric',
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('holder_daily', ['medianPositionUsd']);
};
