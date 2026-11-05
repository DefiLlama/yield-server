// Pre-sunset deprecation headers; replacement strings match the pro-proxy 410 map.
const sunsetNotice = (replacement) => (req, res, next) => {
  res.set('X-Notice', `This route is shutting down. Replacement: ${replacement}`);
  res.set('X-Replacement', replacement);
  next();
};

module.exports = sunsetNotice;
