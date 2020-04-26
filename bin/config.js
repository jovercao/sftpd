const path = require('path');
const { load } = require('@jovercao/config-loader');

const defaultConfig = {
  port: 22,
  users: [],
  // TTL时间内同ip连接锁定次数
  ipLockTimes: 5,
  // ip锁定时长(s)，默认锁定时间5分钟
  ipLockSpan: 5 * 60,
  // 合法连接数清零时长 30s
  ipLockTTL: 30,
  log: {
    //输出位置的基本信息设置
    appenders: {
      //设置控制台输出 （默认日志级别是关闭的（即不会输出日志））
      out: { type: 'console' },

      //所有日志记录，文件类型file   文件最大值maxLogSize 单位byte (B->KB->M) backups:备份的文件个数最大值,最新数据覆盖旧数据
      allLog: {
        type: 'file',
        filename: '${appRoot}/log/all.log',
        keepFileExt: true,
        maxLogSize: 10485760,
        backups: 3
      },
      //错误日志 type:过滤类型logLevelFilter,将过滤error日志写进指定文件
      errorLog: {
        type: 'file',
        filename: '${appRoot}/log/error.log'
      },
      error: {
        type: "logLevelFilter",
        level: "error",
        appender: 'errorLog'
      }
    },
    //不同等级的日志追加到不同的输出位置：appenders: ['out', 'allLog']  categories 作为getLogger方法的键名对应
    categories: {
      default: { appenders: ['out', 'allLog', 'error'], level: 'debug' } //error写入时是经过筛选后留下的
    }
  }
};



const config = load({
  default: defaultConfig,
  appfile: 'app.config.json',
  userfile: '.sftpd.json',
  cwdfile: '.sftpd.json',
  variants: {
  }
});

module.exports = config;
