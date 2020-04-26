const program = require('commander');
const hash = require('../lib/passwordHasher');

function start() {
  const { createServer } = require('../lib/server');
  const config = require('./config');
  createServer(config);
}

program.action(function() {
  start();
});

program.command('start').description('启动服务').action(function() {
  start();
});

program.command('stop').description('停止服务').action(function() {
  console.log('尚未实现，请直接kill进程！');
});

program.command('reconfigure').description('重新加载配置文件').action(function (pwd) {
  console.log('尚未实现，请暂时通过重启进程完成！');
});

program.command('pwd <pwd>').description('哈希密码并输出密码密文').action(function(pwd) {
  console.log(hash(pwd));
});

program.parse(process.argv);

