exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'justlend-v1' WHERE project = 'justlend'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'justlend' WHERE project = 'justlend-v1'`);
};
