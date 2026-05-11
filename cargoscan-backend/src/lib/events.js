const EventEmitter = require("events");

class EventBus extends EventEmitter {
  emit(event, ...args) {
    console.log(`[EventBus] Emitting: ${event}`);
    super.emit(event, ...args);
  }
}

const eventBus = new EventBus();

module.exports = eventBus;
