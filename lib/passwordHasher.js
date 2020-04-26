const crypto = require('crypto');
const secret = 'K5oTfzb9llpH24NviI7aFbAUg7mMQfHee09tHrG8bxlkrFyyV2m3tgmOUIaPeGKKCQ';

module.exports = function hasPassword(password) {
  const hash = crypto.createHmac('sha256', secret)
    .update(password)
    .digest('base64');
  return hash;
};
