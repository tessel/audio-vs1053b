var tm = process.binding('tm');

var MP3_XCS = tm.PIN_A_G1 //Control Chip Select Pin (for accessing SPI Control/Status registers)
var MP3_DCS = tm.PIN_A_G3 //Data Chip Select / BSYNC Pin
var MP3_DREQ = tm.PIN_A_G2 //Data Request Pin: Player asks for more data

//VS10xx SCI Registers
var SCI_MODE = 0x00
var SCI_STATUS = 0x01
var SCI_BASS = 0x02
var SCI_CLOCKF = 0x03
var SCI_DECODE_TIME = 0x04
var SCI_AUDATA = 0x05
var SCI_WRAM = 0x06
var SCI_WRAMADDR = 0x07
var SCI_HDAT0 = 0x08
var SCI_HDAT1 = 0x09
var SCI_AIADDR = 0x0A
var SCI_VOL = 0x0B
var SCI_AICTRL0 = 0x0C
var SCI_AICTRL1 = 0x0D
var SCI_AICTRL2 = 0x0E
var SCI_AICTRL3 = 0x0F

function SPItransfer (byte) {
  return tm.spi_transfer(tm.SPI_0, [byte])[0];
}

//Read the 16-bit value of a VS10xx register
function Mp3ReadRegister (addressbyte){
  while(!tm.pin_read_digital(MP3_DREQ)) ; //Wait for DREQ to go high indicating IC is available
  tm.pin_write_digital(MP3_XCS, tm.PIN_LOW); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  SPItransfer(0x03); //Read instruction
  SPItransfer(addressbyte);

  var response1 = SPItransfer(0xFF);
  while(!tm.pin_read_digital(MP3_DREQ)) ; //Wait for DREQ to go high indicating command is complete
  var response2 = SPItransfer(0xFF); //Read the second byte
  while(!tm.pin_read_digital(MP3_DREQ)) ; //Wait for DREQ to go high indicating command is complete

  tm.pin_write_digital(MP3_XCS, tm.PIN_HIGH); //Deselect Control

  var resultvalue = response1 << 8;
  resultvalue = resultvalue + response2;
  return resultvalue;
}

function Mp3WriteRegister(addressbyte, highbyte, lowbyte){
  while(!tm.pin_read_digital(MP3_DREQ)) ; //Wait for DREQ to go high indicating IC is available
  tm.pin_write_digital(MP3_XCS, tm.PIN_LOW); //Select control

  //SCI consists of instruction byte, address byte, and 16-bit data word.
  SPItransfer(0x02); //Write instruction
  SPItransfer(addressbyte);
  SPItransfer(highbyte);
  SPItransfer(lowbyte);
  while(!tm.pin_read_digital(MP3_DREQ)) ; //Wait for DREQ to go high indicating command is complete
  tm.pin_write_digital(MP3_XCS, tm.PIN_HIGH); //Deselect Control
}

//Set VS10xx Volume Register
function Mp3SetVolume (leftchannel, rightchannel){
  Mp3WriteRegister(SCI_VOL, leftchannel, rightchannel);
}

tm.pin_mode(MP3_DREQ, tm.PIN_INPUT);
tm.pin_mode(MP3_XCS, tm.PIN_OUTPUT);
tm.pin_mode(MP3_DCS, tm.PIN_OUTPUT);

//Setup SPI for VS1053
//  pinMode(10, OUTPUT); //Pin 10 must be set as an output for the SPI communication to work
tm.spi_initialize(tm.SPI_0);
// tm_spi_bitorder_set(TM_SPI_0, MSBFIRST);
tm.spi_datamode_set(tm.SPI_0, tm.SPI_MODE_0);

//From page 12 of datasheet, max SCI reads are CLKI/7. Input clock is 12.288MHz.
//Internal clock multiplier is 1.0x after power up.
//Therefore, max SPI speed is 1.75MHz. We will use 1MHz to be safe.
tm.spi_clockspeed_set(tm.SPI_0, 1000000); //Set SPI bus speed to 1MHz (16MHz / 16 = 1MHz)

tm.pin_write_digital(MP3_XCS, tm.PIN_HIGH); //Deselect Control
tm.pin_write_digital(MP3_DCS, tm.PIN_HIGH); //Deselect Control

console.log("MP3 Shield Example");
SPItransfer(0xFF); //Throw a dummy byte at the bus

Mp3SetVolume(40, 40); //Set initial volume (20 = -10dB)
Mp3WriteRegister(SCI_MODE, 0x48, 0x00);

//Let's check the status of the VS1053
var MP3Mode = Mp3ReadRegister(SCI_MODE);
console.log("SCI_Mode (0x4800) = 0x", MP3Mode.toString(16));

var MP3Status = Mp3ReadRegister(SCI_STATUS);
var vsVersion = (MP3Status >> 4) & 0x000F; //Mask out only the four version bits
console.log("VS Version (VS1053 is 4) = ", vsVersion);
//The 1053B should respond with 4. VS1001 = 0, VS1011 = 1, VS1002 = 2, VS1003 = 3


Mp3WriteRegister(SCI_CLOCKF, 0x60, 0x00); //Set multiplier to 3.0x
tm.spi_clockspeed_set(tm.SPI_0, 4000000); //Set SPI bus speed to 4MHz (16MHz / 4 = 4MHz)

var MP3Clock = Mp3ReadRegister(SCI_CLOCKF);
console.log("SCI_ClockF = 0x", MP3Clock.toString(16));

var len = tm.wethair_mp3_len;
tm.pin_write_digital(MP3_DCS, tm.PIN_LOW);
for (var p = 0; p < len; p = p + 32) {
  // while (!tm.pin_read_digital(MP3_DREQ)) { continue; }
  // tm.pin_write_digital(MP3_DCS, tm.PIN_LOW);
  tm.spi_send(tm.SPI_0, tm.wethair_mp3.substr(p, 32));
  // tm.pin_write_digital(MP3_DCS, tm.PIN_HIGH);
}
console.log('done');

/*
while(p <= &HelloMP3[sizeof(HelloMP3) - 1]) {
  while(!digitalRead(MP3_DREQ)) {
    //DREQ is low while the receive buffer is full
    //You can do something else here, the bus is free...
    //Maybe set the volume or whatever...
  }

  //Once DREQ is released (high) we can now send 32 bytes of data
  digitalWrite(MP3_DCS, LOW); //Select Data
  while(!digitalRead(MP3_DREQ)); //If we ever see DREQ low, then we wait here
  tm_spi_send(TM_SPI_0, p, 32);
  p += 32;
  digitalWrite(MP3_DCS, HIGH); //Deselect Data
}

//End of file - send 2048 zeros before next file
digitalWrite(MP3_DCS, LOW); //Select Data
for (int i = 0 ; i < 2048 ; i++) {
  while(!digitalRead(MP3_DREQ)); //If we ever see DREQ low, then we wait here
  SPItransfer(0);
}
while(!digitalRead(MP3_DREQ)) ; //Wait for DREQ to go high indicating transfer is complete
digitalWrite(MP3_DCS, HIGH); //Deselect Data
*/
