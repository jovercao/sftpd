function createWatcher(lockTimes, lockSpan, lockTTL) {
  const ipCounters = {};

  const lockTTLms = lockTTL * 1000;
  setInterval(function() {
    const now = Date.now();
    for(const [ip, counter] of Object.entries(ipCounters)) {
      if (counter.unlockAt) {
        if (counter.unlockAt <= Date.now()) {
          delete ipCounters[ip];
        }
        continue;
      } else if (now - counter.lastAt >= lockTTLms) {
        delete ipCounters[ip];
      }
    }
  }, lockTTLms);
  return function watch(ip) {
    const counter = ipCounters[ip] || (ipCounters[ip] = {
      times: 0
    });
    counter.lastAt = Date.now();
    // 如果锁定了
    if (counter.unlockAt) {
      // 已经超过解锁时间，清零
      if (counter.unlockAt <= Date.now()) {
        delete counter[unlockAt];
        counter.times = 1;
        return true;
      } else {
        counter.times++;
        // 每试一次增加一个锁定时间
        counter.unlockAt += lockSpan * 1000;
        return false;
      }
    }
    counter.times++;
    if (counter.times >= lockTimes) {
      counter.unlockAt = Date.now() + lockSpan * 1000;
      return false;
    }
    return true;
  };
}

module.exports = {
  createWatcher
}
