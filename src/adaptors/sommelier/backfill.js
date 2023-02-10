const { calcApy } = require('./v2.js');
const { v2Pools } = require('./config.js');

const cellarAddress = v2Pools[0].pool.split('-')[0];

const launchDate = new Date('2023-01-27T00:00:00.000Z');

const dayInSec = 60 * 60 * 24;
const dayInMs = dayInSec * 1000;

const days = [];

// Generate days
let day = new Date();
while (day > launchDate) {
  const epochSec = day.getTime();
  const remainder = epochSec % dayInMs;
  const start = new Date(
    remainder === 0 ? epochSec - dayInMs : epochSec - remainder
  );

  days.push(start);
  day = start;
}

// Convert to epoch seconds
const epochs = days.map((day) => Math.floor(day.getTime() / 1000));

// Get apys
const promises = epochs.map((epoch) => {
  // Today's APY is calculated from yesterday's gains
  const end = epoch - 1;
  const start = epoch - dayInSec - dayInSec;

  return calcApy(cellarAddress, start, end);
});

(async function () {
  const apys = await Promise.all(promises);

  for (let i = days.length - 1; i >= 0; i--) {
    console.log(days[i].toISOString(), apys[i]);
  }
})();
