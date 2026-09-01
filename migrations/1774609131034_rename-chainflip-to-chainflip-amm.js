exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'chainflip-amm' WHERE project = 'chainflip'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'chainflip' WHERE project = 'chainflip-amm'`);
};
