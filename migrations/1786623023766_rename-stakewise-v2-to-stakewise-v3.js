exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stakewise-v3' WHERE project = 'stakewise-v2'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stakewise-v2' WHERE project = 'stakewise-v3'`);
};
