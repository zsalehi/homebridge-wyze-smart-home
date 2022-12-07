const {Service,Characteristic,} = require('../types')
const WyzeAccessory = require('./services/WyzeAccessory')

var lockCurrentState = 1
var lockTargetState = 1
var currentDoorState = 1
var lockBattery = 0
var lockOnOffline = 1



const HOMEBRIDGE_LOCK_MECHANISM_SERVICE = Service.LockMechanism
const HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC = Characteristic.LockCurrentState
const HOMEBRIDGE_LOCK_MECHANISM_TARGET_STATE_CHARACTERISTIC = Characteristic.LockTargetState

const HOMEBRIDGE_BATTERY_SERVICE = Service.Battery
const HOMEBRIDGE_BATTERY_CHARACTERISTIC = Characteristic.BatteryLevel

const HOMEBRIDGE_CONTACT_SENSOR_SERVICE = Service.ContactSensor
const HOMEBRIDGE_CONTACT_SENSOR_CHARACTERISTIC = Characteristic.ContactSensorState.CurrentDoorState

//const noResponse = new Error('No Response')
//noResponse.toString = () => { return noResponse.message }

module.exports = class WyzeLock extends WyzeAccessory {
  constructor (plugin, homeKitAccessory) {
    super(plugin, homeKitAccessory)

    this.lockService = this.homeKitAccessory.getService(HOMEBRIDGE_LOCK_MECHANISM_SERVICE)
    this.contactService = this.homeKitAccessory.getService(HOMEBRIDGE_CONTACT_SENSOR_SERVICE)
    this.batteryService = this.homeKitAccessory.getService(HOMEBRIDGE_BATTERY_SERVICE)

    if (!this.lockService) {
      this.lockService = this.homeKitAccessory.addService(HOMEBRIDGE_LOCK_MECHANISM_SERVICE)
    }

    if (!this.contactService) {
      this.contactService = this.homeKitAccessory.addService(HOMEBRIDGE_CONTACT_SENSOR_SERVICE)
    }

    if (!this.batteryService) {
      this.batteryService = this.homeKitAccessory.addService(HOMEBRIDGE_BATTERY_SERVICE)
    }

    this.batteryService.getCharacteristic(HOMEBRIDGE_BATTERY_CHARACTERISTIC)
      .onGet(this.getBatteryStatus.bind(this))

    this.contactService.getCharacteristic(HOMEBRIDGE_CONTACT_SENSOR_CHARACTERISTIC)
      .onGet(this.getDoorStatus.bind(this))

    this.lockService.getCharacteristic(HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC)
      .onGet(this.getLockCurrentState.bind(this))

    this.lockService.getCharacteristic(HOMEBRIDGE_LOCK_MECHANISM_TARGET_STATE_CHARACTERISTIC)
      .onGet(this.getLockTargetState.bind(this))
      .onSet(this.setLockTargetState.bind(this))
  }

  async updateCharacteristics () {
    if (lockOnOffline === 0) {
      this.getLockCurrentState().updateValue(noResponse)
    } else {
      this.getLockCurrentState
      this.getDoorStatus()
      this.getBatteryStatus()
    }
  }

  async updateLockProperty() {
    const propertyList = await this.getLockInfo(this.mac, this.product_model)
    var lockProperties = propertyList.device

    const prop_key = Object.keys(lockProperties);
    for (let i = 0; i < prop_key.length; i++) {
      const prop = prop_key[i];
     if (prop.locker_status === 'locker_status') {
         lockCurrentState = lockProperties[prop]
         } else if (prop == 'door_open_status') {
          currentDoorState = lockProperties[prop]
        } else if (prop == 'power'){
          lockBattery = lockProperties[prop]
        } else if (prop == 'onoff_line'){
          lockOnOffline = lockProperties[prop]
        }
    }
  }
  async getLockCurrentState () {
    this.updateLockProperty
    this.plugin.log.debug(`[Lock] getLockCurrentState "${lockCurrentState}"`)
    if (lockCurrentState === 2) {
      return HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC.UNSECURED
    } else {
      return HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC.SECURED
    }  
  }

  async getLockTargetState () {
    this.plugin.log.debug(`[Lock] getLockTargetState "${lockTargetState}"`)
    if (lockTargetState === 2) {
      return HOMEBRIDGE_LOCK_MECHANISM_TARGET_STATE_CHARACTERISTIC.UNSECURED
    } else {
      return HOMEBRIDGE_LOCK_MECHANISM_TARGET_STATE_CHARACTERISTIC.SECURED
    }
  }

  async getDoorStatus () {
    this.plugin.log.debug(`[Lock] LockDoorStatus "${currentDoorState}"`)
    if (currentDoorState === 2) {
      return HOMEBRIDGE_CONTACT_SENSOR_CHARACTERISTIC.CLOSED
    } else {
      return HOMEBRIDGE_CONTACT_SENSOR_CHARACTERISTIC.OPEN
    }
  }

  async getBatteryStatus () {
        this.plugin.log.debug(`[Lock] LockBattery "${lockBattery}"`)
        return this.checkBatteryVoltage(lockBattery)
  }

  async setLockTargetState (targetState) {
    this.plugin.log.debug(`[Lock] setLockTargetSate "${targetState}"`)
    await this.plugin.client.controlLock(this.mac, this.product_model, (targetState === HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC.SECURED ? 'remoteLock' : 'remoteUnlock'))

    // Takes a few seconds for the lock command to actually update lock state property
    // Poll every second to see if the lock state has changed to what we expect, or time out after 30 attempts
    await this.poll(async () => await this.getLockCurrentState(), currentState => currentState === targetState, 1000, 30)
    this.lockService.setCharacteristic(Characteristic.LockCurrentState, targetState === HOMEBRIDGE_LOCK_MECHANISM_TARGET_STATE_CHARACTERISTIC.SECURED ? HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC.SECURED : HOMEBRIDGE_LOCK_MECHANISM_CURRENT_STATE_CHARACTERISTIC.UNSECURED)
  }

  async poll (fn, validate, interval, maxAttempts) {
    let attempts = 0

    const executePoll = async (resolve, reject) => {
      const result = await fn()
      attempts++

      if (validate(result)) {
        return resolve(result)
      } else if (maxAttempts && maxAttempts === attempts) {
        return reject(new Error('Exceeded maximum attempts'))
      } else {
        setTimeout(executePoll, interval, resolve, reject)
      }
    }

    return new Promise(executePoll)
  }

  checkBatteryVoltage (deviceVoltage) {
    if (deviceVoltage >= 100) {
      return 100
    } else { return deviceVoltage }
  }
}
