exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'maia-cl' WHERE project = 'maia-v3'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'maia-v3' WHERE project = 'maia-cl'`);
};
