exports.up = (pgm) => {
  pgm.addColumns('config', {
    tokenAddress: 'text',
  });
};
