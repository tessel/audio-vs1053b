#Audio
Driver for the audio-vs1053b Tessel audio module ([VS1053b](http://www.vlsi.fi/fileadmin/datasheets/vlsi/vs1053.pdf)).

##Really Important Information
e.g. "this isn't ready to go yet" or "here is some special way you have to use this or it won't work"
Hopefully we don't need this section by the time we release things to the public

##Installation
```sh
npm install audio-vs1053b
```
##Example
```js
var tessel = require('tessel');

var audio = require('audio-vs1053b').connect(tessel.port("A"));

audio.enableHeadphones();
// audio.enableLineOut();
audio.playSample();

// audio.record();
```

##Methods

*  **`audio`.enableHeadphones()**

*  **`audio`.playSample()**

*  **`audio`.enableLineOut()**

*  **`audio`.record()**

## License

MIT
