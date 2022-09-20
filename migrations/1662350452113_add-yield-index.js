exports.up = (pgm) => {
  // composite index for yield;
  // added after ingestion of historical data
  pgm.createIndex('yield', [
    { name: 'configID', sort: 'ASC' },
    { name: 'timestamp', sort: 'DESC' },
  ]);
};
