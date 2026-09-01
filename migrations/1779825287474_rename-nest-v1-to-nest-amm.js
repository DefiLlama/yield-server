exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-amm' WHERE project = 'nest-v1'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-v1' WHERE project = 'nest-amm'`);
};
