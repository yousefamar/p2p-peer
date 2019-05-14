import EventEmitter from './event-emitter.js';

function createHandler(objectPath, eventEmitter) {
	return {
		set: (target, prop, value) => {
			eventEmitter.emit(objectPath + '.' + prop, value);
			// Emit on root too to have a catch-all
			eventEmitter.emit('.', objectPath + '.' + prop, value);
			if (typeof value === 'object' && !!value)
				value = observe(value, objectPath + '.' + prop, eventEmitter).object;
			target[prop] = value;
			return true;
		}
	};
}

export default function observe(object, objectPath = '', eventEmitter = new EventEmitter()) {
	for (let key in object) {
		let value = object[key];
		if (typeof value !== 'object' || !value)
			continue;
		object[key] = observe(object[key], objectPath + '.' + key, eventEmitter).object;
	}
	return {
		object: new Proxy(object, createHandler(objectPath, eventEmitter)),
		eventEmitter: eventEmitter
	};
}
