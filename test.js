var tessel = require('tessel');

var audio = require('./').connect(tessel.port('a'));

audio.enableHeadphones();
// audio.enableLineOut();
audio.playSample();

// audio.record();