exports.up = (pgm) => {
  pgm.renameColumn('config', 'token', 'searchTokenOverride');
  pgm.addColumns('config', {
    token: 'text',
  });
};
