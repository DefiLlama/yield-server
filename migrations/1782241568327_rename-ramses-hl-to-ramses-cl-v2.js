exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'ramses-cl-v2' WHERE project = 'ramses-hl'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'ramses-hl' WHERE project = 'ramses-cl-v2'`);
};
