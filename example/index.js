const path = require('path');

process.versions.pkg = '4.4.4';
process.execPath = path.resolve(__dirname, 'sftps');
process.cwd = () => path.resolve(__dirname);
process.env.NODE_ENV = 'development';

require('../bin/cli');
