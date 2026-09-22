exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'rhea-lend' WHERE project = 'burrow'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'burrow' WHERE project = 'rhea-lend'`);
};
