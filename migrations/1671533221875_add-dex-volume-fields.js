exports.up = (pgm) => {
  pgm.addColumns('yield', {
    volumeUsd1d: 'numeric',
    volumeUsd7d: 'numeric',
  });
};
