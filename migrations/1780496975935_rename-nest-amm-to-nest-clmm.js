exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-clmm' WHERE project = 'nest-amm'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-amm' WHERE project = 'nest-clmm'`);
};
