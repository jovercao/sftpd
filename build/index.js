const { version } = require('../package.json');
const path = require('path');
const { exec } = require('pkg');
const ProgressBar = require('progress');

const platforms = [{
  name: 'win64',
  target: 'node10-win-x64',
  suffix: 'windows-x64'
}];

async function build() {
  const bar = new ProgressBar(':current/:total: :name', { total: platforms.length });
  for (const { suffix, target, name } of platforms) {
    const outputPath = path.resolve(__dirname, '../dist/', `sftpd-${version}-${suffix}.exe`);
    bar.tick({
      name
    });
    await exec([path.resolve(__dirname, '..'), '--target', target, '--output', outputPath]);
  }
}

build();
