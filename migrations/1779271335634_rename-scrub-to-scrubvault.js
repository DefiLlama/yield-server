exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'scrubvault' WHERE project = 'scrub'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'scrub' WHERE project = 'scrubvault'`);
};
