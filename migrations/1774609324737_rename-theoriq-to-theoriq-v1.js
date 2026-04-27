exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'theoriq-v1' WHERE project = 'theoriq'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'theoriq' WHERE project = 'theoriq-v1'`);
};
