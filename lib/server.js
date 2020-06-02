const ssh2 = require('ssh2');
const fs = require('fs');
const { getLogger } = require('./logger');
const { makeListener } = require('./listener');

function createServer(config) {
  const logger = getLogger(config.log);
  logger.debug(`使用host证书文件：${config.hostKeyFile}`);
  if (!fs.existsSync(config.hostKeyFile)) {
    const error = new Error('指定证书文件不存在或未指定证书文件！请更正配置`hostKeyFile`后再试！');
    logger.error(error);
    throw error;
  }
  const server = new ssh2.Server({
    // algorithms: 'hmac',
    greeting: config.greeting,
    highWaterMark: config.maxConnections,
    ident: config.ident,
    banner: config.banner,
    debug: config.debug,
    hostKeys: [
      fs.readFileSync(config.hostKeyFile)
    ]
  });
  const listener = makeListener(config, { server, logger });
  Object.defineProperty(server, 'listener', {
    get: () => listener
  });
  server.on('connection', listener);
  // 错误
  server.on('error', function(error) {
    logger.error(`服务器连接错误:${error}`);
  });
  server.listen(config.port, function () {
    logger.info('服务启动成功，监听端口号：' + config.port);
  });

  server.stop = async function () {
    logger.info('正在停止服务');
    listener.closeAll();
    await this.close();
    logger.info('服务已经停止');
  };

  return server;
}

module.exports = {
  createServer
};
