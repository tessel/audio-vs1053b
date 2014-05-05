# For the module code, see the branches on this repository:

(these are soon to be separate repositories)

* [master-accel-mma84](https://github.com/tessel/modules/tree/master-accel-mma84)
* [master-ambient-attx4](https://github.com/tessel/modules/tree/master-ambient-attx4)
* [master-audio-vs1053b](https://github.com/tessel/modules/tree/master-audio-vs1053b)
* [master-ble-ble113](https://github.com/tessel/modules/tree/master-ble-ble113)
* [master-camera-vc0706](https://github.com/tessel/modules/tree/master-camera-vc0706)
* [master-climate-si7005](https://github.com/tessel/modules/tree/master-climate-si7005)
* [master-gprs-sim900](https://github.com/tessel/modules/tree/master-gprs-sim900)
* [master-gps-a2235h](https://github.com/tessel/modules/tree/master-gps-a2235h)
* [master-ir-attx4](https://github.com/tessel/modules/tree/master-ir-attx4)
* [master-relay-mono](https://github.com/tessel/modules/tree/master-relay-mono)
* [master-rfid-pn532](https://github.com/tessel/modules/tree/master-rfid-pn532)
* [master-servo-pca9685](https://github.com/tessel/modules/tree/master-servo-pca9685)

#Standards for module folders

##Files

Main folder:

* Readme.md
* index.js contains module firmware
* package.json
* examples folder

examples folder:

* \<module name\>.js (not the module package, but e.g. "accelerometer" or "ble") contains a full, commented demo of the basic functionalities available.
* other examples if you want, with appropriate names

##Index Code Template
```js
var tessel = require('tessel');

// no global state! global variables/functions
// are fine as long as you can have more than one
// instance e.g. two accelerometers on two different ports

// private functions should take in a i2c or spi or uart etc.
// variable, basically any state they play with
function writeRegister (spi, next) {
    spi.transfer([somebytes], next);
}

function Accelerometer (port) {
    // create a private spi/i2c/uart instance
    this.spi = new port.SPI()
}

Accelerometer.prototype.somemethod = function () { }

Accelerometer.prototype.somemethod = function () { }

Accelerometer.prototype.somemethod = function () { }

// public function
function use () {
    return new Accelerometer
}

// expose your classes and API all at the bottom
exports.Accelerometer = Accelerometer
exports.use = use
```

##Readme template:

#Module Title \<module logo\>
Very brief description, e.g. "Driver for the accel-mma84 Tessel accelerometer module (\<key chip\>)."

##Really Important Information
e.g. "this isn't ready to go yet" or "here is some special way you have to use this or it won't work"
Hopefully we don't need this section by the time we release things to the public

##Installation
```sh
npm install relay-im48dgr
```
##Example
```js
exactly the contents of the examples/<module name>.js but the importation line should refer to the node module
```

##Methods

*  **`relay`.initialize(portToUse)**
Description of method

*  **`relay`.checkChannel(channel)**
Description etc

*  **`relay`.turnOn(channel)**

*  **`relay`.turnOff(channel)**

*  **`relay`.toggle(channel)**

*  **`relay`.getState(channel)**

##Events

* *event*

##Further Examples

* Audio playback (links to example for this in the "examples" folder)

##Advanced

* Any cool hacks e.g. wire hacks or whatever

## License

MIT
