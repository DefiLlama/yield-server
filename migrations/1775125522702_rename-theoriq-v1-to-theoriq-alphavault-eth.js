exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'theoriq-alphavault-eth' WHERE project = 'theoriq-v1'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'theoriq-v1' WHERE project = 'theoriq-alphavault-eth'`);
};
