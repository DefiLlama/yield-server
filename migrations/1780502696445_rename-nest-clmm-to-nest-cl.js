exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-cl' WHERE project = 'nest-clmm'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-clmm' WHERE project = 'nest-cl'`);
};
