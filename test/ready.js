var tessel = require('tessel');

var portname = process.argv[2] || 'A';
var audio = require('../').use(tessel.port[portname]);

console.log('1..1');

audio.on('ready', function() {
  console.log('ok');
});

audio.on('error', function (err) {
  console.log('not ok - error:', err);
})
