var tessel = require('tessel');
var fs = require('fs');
var audio = require('../').use(tessel.port('a'));

console.log('trying to connect...');
audio.on('ready', function() {
  console.log("Ready to go!");
  audio.setVolume(20, 20, function(err) {
    if (err) return console.log('err setting volume', err);
    var song = fs.readFileSync('/app/sample.mp3');
    audio.play(song, function(err) {
      if (err) {
        console.log("error playing song: ", err);
      }
      else {
        console.log("Done playing the first song");
      }
    });
    // setTimeout(function audioPause() {
    //   console.log('pausing!');
    //   audio.pause(function paused() {
    //     setTimeout(function audioResume() {
    //       audio.play();
    //       console.log('started playing again');
    //         setTimeout(function stopping() {
    //           console.log('stopping');
    //           audio.stop(function stopped() {
    //             console.log('stopped!');
    //           })
    //         }, 1000);
    //     }, 1000);
    //   });

    // }, 1000);
  })
});

audio.on('error', function(err) {
  console.log("Failed to connect", err);
});

setInterval(function(){}, 20000);