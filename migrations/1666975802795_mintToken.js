exports.up = (pgm) => {
  pgm.addColumns('config', {
    mintedCoin: 'text',
  });
};
