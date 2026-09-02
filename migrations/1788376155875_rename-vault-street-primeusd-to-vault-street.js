exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'vault-street' WHERE project = 'vault-street-primeusd'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'vault-street-primeusd' WHERE project = 'vault-street'`);
};
