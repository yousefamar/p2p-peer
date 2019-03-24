// TODO: Use three.js' built-in implementation instead?
export default class EventEmitter {
	constructor() {
		this.listeners = {};
	}

	on(event, callback) {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(callback);
	}

	removeListener(event, callback) {
		this.listeners[event] = this.listeners[event] || [];

		let id = this.listeners[event].indexOf(callback);
		if (id < 0)
			return;

		this.listeners[event].splice(id, 1);
	}

	emit(event, ...data) {
		this.listeners[event] = this.listeners[event] || [];

		for (let callback of this.listeners[event])
			callback(...data);
	}
}
