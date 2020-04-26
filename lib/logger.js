
const log4js = require('log4js');

function getLogger(config) {
  return log4js.configure(config).getLogger();
}

module.exports = {
  getLogger
};
