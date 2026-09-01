exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'liminal-basis' WHERE project = 'liminal'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'liminal' WHERE project = 'liminal-basis'`);
};
