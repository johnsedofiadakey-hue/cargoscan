const EventEmitter = require("events");
const logger = require("./logger");

class EventBus extends EventEmitter {
  emit(event, ...args) {
    logger.info({ event }, "event emitted");
    super.emit(event, ...args);
  }
}

const eventBus = new EventBus();

module.exports = eventBus;
