exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'gmx-evm' WHERE project = 'gmx-v2-perps'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'gmx-v2-perps' WHERE project = 'gmx-evm'`);
};
